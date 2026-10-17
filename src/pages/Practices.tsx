import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n';
import { usePets } from '../pets/PetsProvider';
import {
  addFavoritePractice,
  geocodePlace,
  listFavoritePractices,
  listInviteRequests,
  removeFavoritePractice,
  requestPracticeInvite,
  searchPractices,
  setVetPractice,
  type FavoritePractice,
  type PlaceHit,
  type PracticeHit,
} from '../lib/api';
import { applyOpenNow, loadOpeningHours, openingInfo, type OhConstructor, type OpeningInfo } from '../lib/openingHours';
import {
  PRACTICE_SERVICES,
  PRACTICE_SPECIES,
  PRACTICE_TITLES,
  SERVICE_TEXT,
  SPECIES_TEXT,
  TITLE_TEXT,
  isPracticeSpecies,
} from '../lib/practiceCatalog';
import {
  EMPTY_FILTERS,
  RADII,
  countKey,
  countMatches,
  filtersToQuery,
  hasOfferFilters,
  queryToFilters,
  readLastPlace,
  saveLastPlace,
  splitResults,
  toRpcParams,
  toggle,
  type PracticeFilters,
  type Radius,
} from '../lib/practices';
import { canEdit } from '../lib/sharing';
import { useNow } from '../lib/useNow';
import { Dialog } from '../components/Dialog';
import { Loading } from '../components/Loading';
import { Switch } from '../components/Switch';
import { PlaceCombobox, placeLabel } from '../components/practices/PlaceCombobox';
import { PracticeCard, type PracticeView } from '../components/practices/PracticeCard';
import { StatusLine, useFocusAfter, useStatus } from '../components/record/shared';
import { recordErrorKey } from '../lib/record';

type Center = { lat: number; lon: number; label: string; fromDevice: boolean };

/** Praxissuche: Praxen aus OpenStreetMap, Angebot nur mit Praxisprofil. Keine Karte, kein Tracking. */
export function Practices() {
  const { t } = useI18n();
  const uid = useId();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => queryToFilters(params), [params]);
  const { pets, myRole, upsertLocal } = usePets();
  const now = useNow();

  const [placeInput, setPlaceInput] = useState(() => filters.place || readLastPlace() || '');
  const [center, setCenter] = useState<Center | null>(null);
  const [rows, setRows] = useState<PracticeHit[] | null>(null);
  const [rowsKey, setRowsKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [geoMsg, setGeoMsg] = useState<MessageKey | null>(null);
  const [nameInput, setNameInput] = useState(filters.q);
  const [favorites, setFavorites] = useState<FavoritePractice[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [Oh, setOh] = useState<OhConstructor | null>(null);
  const [vetFor, setVetFor] = useState<PracticeView | null>(null);
  const [inviteFor, setInviteFor] = useState<PracticeView | null>(null);
  const [status, setStatus] = useStatus();
  const counter = useRef<HTMLParagraphElement>(null);
  const focusCounter = useRef(false);
  const { register, focusLater } = useFocusAfter();

  const editablePets = pets.filter((p) => canEdit(myRole(p)));

  const setFilters = useCallback(
    (next: Partial<PracticeFilters>) => {
      const merged = { ...queryToFilters(params), ...next };
      setParams(filtersToQuery(merged), { replace: true });
    },
    [params, setParams],
  );

  // Öffnungszeiten-Bibliothek nachladen (nur auf dieser Seite)
  useEffect(() => {
    let alive = true;
    loadOpeningHours()
      .then((c) => alive && setOh(() => c))
      .catch((e: unknown) => console.error(e));
    return () => {
      alive = false;
    };
  }, []);

  // Favoriten und Einladungswünsche
  const loadFavs = useCallback(async () => {
    try {
      const [f, inv] = await Promise.all([listFavoritePractices(), listInviteRequests()]);
      setFavorites(f);
      setInvited(inv);
    } catch (e) {
      console.error(e);
    }
  }, []);
  useEffect(() => {
    void loadFavs();
  }, [loadFavs]);

  // Ort aus der URL (oder zuletzt gewählt) wiederherstellen
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const place = filters.place || readLastPlace();
    if (!place) return;
    geocodePlace(place)
      .then((h) => {
        const hit = h[0];
        if (hit) choosePlace(hit, false);
      })
      .catch((e: unknown) => {
        console.error(e);
        setError(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur einmal beim Öffnen
  }, []);

  function choosePlace(hit: PlaceHit, focus = true) {
    const label = placeLabel(hit);
    setPlaceInput(label);
    setCenter({ lat: hit.lat, lon: hit.lon, label, fromDevice: false });
    setGeoMsg(null);
    saveLastPlace(hit.postcode);
    if (filters.place !== hit.postcode || !center || center.fromDevice) {
      focusCounter.current = focus;
      if (filters.place !== hit.postcode) setFilters({ place: hit.postcode });
    } else if (focus) {
      // gleicher Ort, keine neue Suche: Fokus sofort setzen, sonst bliebe die Markierung hängen
      setTimeout(() => counter.current?.focus(), 0);
    }
  }

  function locateMe() {
    setGeoMsg(null);
    if (!('geolocation' in navigator)) {
      setGeoMsg('psGeoNone');
      return;
    }
    setGeoMsg('psGeoWait');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Standort nur für diese Suche; nicht gespeichert, nicht in der URL
        setGeoMsg(null);
        setPlaceInput(t('psMyLocation'));
        setCenter({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: t('psMyLocation'), fromDevice: true });
        focusCounter.current = true;
        if (filters.place) setFilters({ place: '' });
      },
      (err) => setGeoMsg(err.code === err.PERMISSION_DENIED ? 'psGeoDenied' : 'psGeoFail'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  // Suche bei Änderung von Ort oder Filtern
  const rpcKey = center ? JSON.stringify(toRpcParams(filters, center)) : '';
  useEffect(() => {
    if (!rpcKey) return;
    let alive = true;
    setLoading(true);
    setError(false);
    searchPractices(JSON.parse(rpcKey) as ReturnType<typeof toRpcParams>)
      .then((r) => {
        if (!alive) return;
        setRows(r);
        setRowsKey(rpcKey);
        setLoading(false);
        if (focusCounter.current) {
          focusCounter.current = false;
          setTimeout(() => counter.current?.focus(), 0);
        }
      })
      .catch((e: unknown) => {
        console.error(e);
        if (!alive) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [rpcKey]);
  // Ergebnisse gehören zu genau einer Suche; bis die neue fertig ist, nichts Altes mit neuem Ort anzeigen
  const fresh = rowsKey === rpcKey;
  const busy = loading || (!!rpcKey && !fresh && !error);

  // Namenssuche: kurz warten
  useEffect(() => {
    if (nameInput === filters.q) return;
    const timer = setTimeout(() => setFilters({ q: nameInput }), 300);
    return () => clearTimeout(timer);
  }, [nameInput, filters.q, setFilters]);

  const offer = hasOfferFilters(filters);
  const infoOf = useCallback((p: { opening_hours: string | null }): OpeningInfo => (Oh ? openingInfo(Oh, p.opening_hours, now) : { state: 'unknown', today: null }), [Oh, now]);
  const split = rows ? splitResults(rows, offer, filters.sort) : { matches: [], unknown: [] };
  const openMatches = applyOpenNow(split.matches, infoOf, filters.openNow);
  const openUnknown = applyOpenNow(split.unknown, infoOf, filters.openNow);
  // Mit „Jetzt geöffnet“: geöffnete Treffer plus Treffer mit unbekannten Zeiten (sie werden ja angezeigt)
  const count = rows ? (filters.openNow ? openMatches.shown.length + openMatches.unknownTimes.length : countMatches(rows, offer)) : 0;
  const ck = countKey(count);
  const favIds = new Set(favorites.map((f) => f.id));
  const anyFilter = offer || filters.openNow || filters.q.trim() !== '' || filters.radius !== EMPTY_FILTERS.radius;

  async function toggleFavorite(p: PracticeView) {
    const isFav = favIds.has(p.id);
    try {
      if (isFav) await removeFavoritePractice(p.id);
      else await addFavoritePractice(p.id);
      await loadFavs();
      setStatus(t(isFav ? 'psFavRemoved' : 'psFavAdded', { x: p.name }));
    } catch (e) {
      console.error(e);
      setStatus(t('psError'), false);
    }
    focusLater(`fav-${p.id}`);
  }

  async function invite(p: PracticeView) {
    setInviteFor(null);
    try {
      await requestPracticeInvite(p.id);
      setInvited((cur) => new Set(cur).add(p.id));
      setStatus(t('nbSent', { n: p.name }));
    } catch (e) {
      console.error(e);
      setStatus(t('psError'), false);
    }
    focusLater(`inv-${p.id}`);
  }

  async function setVet(p: PracticeView, petId: string) {
    setVetFor(null);
    const pet = pets.find((x) => x.id === petId);
    if (!pet) return;
    try {
      const updated = await setVetPractice(petId, p.name, p.phone);
      upsertLocal(updated);
      setStatus(t('psVetSet', { x: p.name, n: pet.name }));
    } catch (e) {
      console.error(e);
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater(`vet-${p.id}`);
  }

  const card = (p: PracticeView & { opening_hours: string | null }, showUnknown: boolean) => (
    <PracticeCard
      key={p.id}
      p={p}
      info={infoOf(p)}
      favorite={favIds.has(p.id)}
      invited={invited.has(p.id)}
      canSetVet={editablePets.length > 0}
      showOfferUnknown={showUnknown}
      onFavorite={() => void toggleFavorite(p)}
      onSetVet={() => setVetFor(p)}
      onInvite={() => setInviteFor(p)}
      registerFocus={register}
    />
  );

  const chip = (pressed: boolean, label: string, onClick: () => void, key: string) => (
    <button key={key} type="button" className="chip" aria-pressed={pressed} onClick={() => { focusCounter.current = false; onClick(); }}>{label}</button>
  );

  return (
    <div className="page stack-lg">
      <header className="page-head">
        <h1>{t('nbTitle')}</h1>
        <p className="muted">{t('nbSub')}</p>
      </header>

      {favorites.length > 0 && (
        <section className="stack" aria-labelledby={`${uid}-fav`}>
          <h2 id={`${uid}-fav`}>{t('psFavH')}</h2>
          <ul className="practice-list">{favorites.map((f) => card(f, false))}</ul>
        </section>
      )}

      <section className="card stack" aria-labelledby={`${uid}-where`}>
        <h2 id={`${uid}-where`}>{t('psWhere')}</h2>
        <PlaceCombobox value={placeInput} onValue={setPlaceInput} onPick={(h) => choosePlace(h)} onError={() => setError(true)} />
        <div className="actions actions-start">
          <button type="button" className="btn btn-secondary" onClick={locateMe}>{t('psMyLocation')}</button>
        </div>
        {geoMsg && <p className={`notice ${geoMsg === 'psGeoWait' ? 'notice-info' : 'notice-warn'}`} role="status">{t(geoMsg)}</p>}
        <p className="muted small">{t('psGeoPrivacy')}</p>
        <div className="row-2">
          <div className="field">
            <label htmlFor={`${uid}-r`}>{t('psRadius')}</label>
            <select id={`${uid}-r`} value={filters.radius} onChange={(e) => setFilters({ radius: Number(e.target.value) as Radius })}>
              {RADII.map((r) => <option key={r} value={r}>{t('psKm', { n: r })}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-q`}>{t('psName')}</label>
            <input id={`${uid}-q`} type="search" maxLength={80} value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card stack" aria-labelledby={`${uid}-filters`}>
        <h2 id={`${uid}-filters`} className="sr-only">{t('psFilters')}</h2>
        <div role="group" aria-labelledby={`${uid}-g-sp`} className="stack">
          <h3 id={`${uid}-g-sp`}>{t('psFor')}</h3>
          <div className="pet-switcher">
            {chip(filters.species === null, t('psAll'), () => setFilters({ species: null }), 'all')}
            {pets.filter((p) => isPracticeSpecies(p.species)).map((p) =>
              chip(false, t('psPetOf', { a: t(SPECIES_TEXT[p.species as keyof typeof SPECIES_TEXT]), n: p.name }), () => setFilters({ species: p.species as (typeof PRACTICE_SPECIES)[number] }), `pet-${p.id}`),
            )}
            {PRACTICE_SPECIES.map((s) => chip(filters.species === s, t(SPECIES_TEXT[s]), () => setFilters({ species: filters.species === s ? null : s }), s))}
          </div>
        </div>
        <div role="group" aria-labelledby={`${uid}-g-sv`} className="stack">
          <h3 id={`${uid}-g-sv`}>{t('psNeed')}</h3>
          <div className="pet-switcher">
            {PRACTICE_SERVICES.map((s) => chip(filters.services.includes(s), t(SERVICE_TEXT[s]), () => setFilters({ services: toggle(filters.services, s) }), s))}
          </div>
        </div>
        <div role="group" aria-labelledby={`${uid}-g-ti`} className="stack">
          <h3 id={`${uid}-g-ti`}>{t('psSpecH')}</h3>
          <div className="pet-switcher">
            {PRACTICE_TITLES.map((s) => chip(filters.titles.includes(s), t(TITLE_TEXT[s]), () => setFilters({ titles: toggle(filters.titles, s) }), s))}
          </div>
        </div>
        <Switch checked={filters.openNow} onChange={(on) => setFilters({ openNow: on })} label={t('psOpenSwitch')} />
        <div className="actions actions-start">
          <div className="field">
            <label htmlFor={`${uid}-sort`}>{t('psSort')}</label>
            <select id={`${uid}-sort`} value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value === 'name' ? 'name' : 'distance' })}>
              <option value="distance">{t('psSortDistance')}</option>
              <option value="name">{t('psSortName')}</option>
            </select>
          </div>
          {anyFilter && (
            <button type="button" className="btn btn-ghost" onClick={() => { setNameInput(''); setFilters({ ...EMPTY_FILTERS, place: filters.place }); }}>
              {t('psReset')}
            </button>
          )}
        </div>
      </section>

      <section className="stack" aria-labelledby={`${uid}-res`}>
        <h2 id={`${uid}-res`}>{t('psResults')}</h2>
        {!center && !busy && <p className="muted">{t('psStart')}</p>}
        {busy && <Loading />}
        {error && <p className="notice notice-crit" role="alert">{t('psError')}</p>}
        <p ref={counter} tabIndex={-1} className="result-count" aria-live="polite">
          {center && rows && !busy ? `${t(ck.key, { n: ck.n })} · ${center.label}` : ''}
        </p>
        {center && rows && !busy && (
          <>
            {count === 0 && (
              <div className="stack">
                <p>{t('psNone')}</p>
                {anyFilter && (
                  <button type="button" className="btn btn-secondary btn-start" onClick={() => { setNameInput(''); setFilters({ ...EMPTY_FILTERS, place: filters.place }); }}>
                    {t('psReset')}
                  </button>
                )}
              </div>
            )}
            {openMatches.shown.length > 0 && <ul className="practice-list">{openMatches.shown.map((p) => card(p, !offer))}</ul>}
            {openMatches.unknownTimes.length > 0 && (
              <>
                <h3>{t('psHoursUnknownH')}</h3>
                <ul className="practice-list">{openMatches.unknownTimes.map((p) => card(p, !offer))}</ul>
              </>
            )}
            {offer && openUnknown.shown.length + openUnknown.unknownTimes.length > 0 && (
              <div className="stack">
                <h3>{t('psUnknownH')}</h3>
                <ul className="practice-list">{[...openUnknown.shown, ...openUnknown.unknownTimes].map((p) => card(p, true))}</ul>
              </div>
            )}
          </>
        )}
        <p className="muted small">{t('psNote')}</p>
        <p className="small osm-credit">
          {t('psOsmCredit')}{' '}
          <a className="link" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t('psOsmCopy')}</a>
        </p>
        <p className="muted small">{t('psOsmFix')}</p>
      </section>
      <StatusLine status={status} />

      <Dialog
        open={inviteFor !== null}
        title={t('nbInvite')}
        onClose={() => setInviteFor(null)}
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setInviteFor(null)}>{t('cancelBtn')}</button>
            <button type="button" className="btn btn-primary" onClick={() => inviteFor && void invite(inviteFor)}>{t('psInviteYes')}</button>
          </>
        }
      >
        {inviteFor && <p>{t('psInviteAsk', { x: inviteFor.name })}</p>}
      </Dialog>
      <VetDialog practice={vetFor} pets={editablePets} onClose={() => setVetFor(null)} onChoose={(petId) => vetFor && void setVet(vetFor, petId)} />
    </div>
  );
}

function VetDialog({ practice, pets, onClose, onChoose }: { practice: PracticeView | null; pets: { id: string; name: string }[]; onClose: () => void; onChoose: (petId: string) => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [petId, setPetId] = useState('');
  const pid = practice?.id;
  useEffect(() => {
    if (pid) setPetId(pets[0]?.id ?? '');
  }, [pid, pets]);
  return (
    <Dialog
      open={practice !== null}
      title={t('psSetVetTitle')}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
          <button type="button" className="btn btn-primary" disabled={!petId} onClick={() => onChoose(petId)}>{t('psSetVetYes')}</button>
        </>
      }
    >
      {practice && (
        <fieldset className="field">
          <legend>{t('psSetVetAsk', { x: practice.name })}</legend>
          <div className="radio-row">
            {pets.map((p) => (
              <label key={p.id} className="radio">
                <input type="radio" name={`${uid}-pet`} value={p.id} checked={petId === p.id} onChange={() => setPetId(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </Dialog>
  );
}
