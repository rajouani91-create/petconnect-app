import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { geocodePlace, type PlaceHit } from '../../lib/api';
import { INPUT_DELAY_MS, MIN_QUERY, debounce, latestOnly } from '../../lib/debounce';
import { fullPostcode, type PracticeCountry } from '../../lib/practiceCountries';
import { highlightParts } from '../../lib/practices';

export const placeLabel = (h: PlaceHit) => [h.postcode, h.place].filter(Boolean).join(' ');

/**
 * „Ort oder PLZ“ als Combobox (WAI-ARIA 1.2, Liste mit Vorschlägen aus geocode_place).
 * Vorschläge 250 ms nach dem letzten Tastendruck, ab 2 Zeichen; ältere Antworten werden verworfen.
 * Pfeiltasten wählen, Enter übernimmt (ohne Auswahl: erster Vorschlag), Escape schließt.
 * Vollständige Postleitzahl des Landes (DE/FR: 5 Ziffern, NL: 4 Ziffern, auch „3511 AB“) mit genau einem Treffer:
 * automatisch übernehmen (`auto = true`) und ansagen.
 */
export function PlaceCombobox({
  country,
  value,
  onValue,
  onPick,
  onError,
}: {
  country: PracticeCountry;
  value: string;
  onValue: (v: string) => void;
  onPick: (hit: PlaceHit, auto: boolean) => void;
  onError: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const listId = `${uid}-list`;
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [hitsFor, setHitsFor] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [noHit, setNoHit] = useState(false);
  const [announce, setAnnounce] = useState('');
  const typed = useRef(false);
  const latest = useMemo(() => latestOnly(), []);
  // Props in Refs, damit die verzögerte Abfrage immer die aktuellen Rückrufe nutzt
  const cb = useRef({ onPick, onError, t, country });
  cb.current = { onPick, onError, t, country };

  function pick(h: PlaceHit, auto = false) {
    typed.current = false;
    latest.cancel();
    lookup.cancel();
    setOpen(false);
    setActive(-1);
    setHits([]);
    setNoHit(false);
    setAnnounce(cb.current.t('psPlacePicked', { p: h.place ?? h.postcode, z: h.postcode }));
    cb.current.onPick(h, auto);
  }

  const lookup = useMemo(
    () =>
      debounce((q: string) => {
        const isCurrent = latest.start();
        const land = cb.current.country;
        geocodePlace(q, land)
          .then((h) => {
            if (!isCurrent()) return;
            if (fullPostcode(q, land) !== null && h.length === 1) {
              pick(h[0]!, true);
              return;
            }
            setHits(h);
            setHitsFor(q);
            setOpen(h.length > 0);
            setActive(-1);
            setNoHit(h.length === 0);
          })
          .catch((e: unknown) => {
            if (!isCurrent()) return;
            console.error(e);
            cb.current.onError();
          });
      }, INPUT_DELAY_MS),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pick nutzt nur Setter und Refs
    [latest],
  );
  useEffect(() => () => lookup.cancel(), [lookup]);

  // Land gewechselt: Vorschläge aus dem anderen Land verwerfen
  useEffect(() => {
    lookup.cancel();
    latest.cancel();
    setHits([]);
    setHitsFor('');
    setOpen(false);
    setActive(-1);
    setNoHit(false);
  }, [country, lookup, latest]);

  // Vorschläge laden, sobald getippt wird; ein einzelnes Zeichen sucht nicht
  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      lookup.cancel();
      latest.cancel();
      setHits([]);
      setOpen(false);
      setNoHit(false);
      return;
    }
    lookup(q);
  }, [value, lookup, latest]);

  async function pickFirst() {
    const q = value.trim();
    if (!q) return;
    lookup.cancel();
    const isCurrent = latest.start();
    try {
      const h = hits.length > 0 && hitsFor === q ? hits : await geocodePlace(q, country);
      if (!isCurrent()) return;
      if (h[0]) pick(h[0]);
      else {
        setNoHit(true);
        setOpen(false);
      }
    } catch (e) {
      console.error(e);
      onError();
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && hits.length > 0) setOpen(true);
      setActive((a) => (hits.length === 0 ? -1 : (a + 1) % hits.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (hits.length === 0 ? -1 : a <= 0 ? hits.length - 1 : a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = open && active >= 0 ? hits[active] : undefined;
      if (h) pick(h);
      else void pickFirst();
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  return (
    <div className="field combo">
      <label htmlFor={`${uid}-in`}>{t('psPlace')}</label>
      <div className="combo-row">
        <input
          id={`${uid}-in`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${uid}-opt-${active}` : undefined}
          aria-describedby={noHit ? `${uid}-none` : undefined}
          autoComplete="postal-code"
          inputMode="search"
          value={value}
          onChange={(e) => {
            typed.current = true;
            setAnnounce('');
            onValue(e.target.value);
          }}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <button type="button" className="btn btn-primary" onClick={() => void pickFirst()}>{t('psSearch')}</button>
      </div>
      <div id={listId} role="listbox" aria-label={t('psPlaceList')} className="combo-list" hidden={!open}>
        {hits.map((h, i) => (
          <div
            key={`${h.postcode}-${h.place ?? ''}`}
            id={`${uid}-opt-${i}`}
            role="option"
            tabIndex={-1}
            aria-selected={i === active}
            aria-label={placeLabel(h)}
            className={i === active ? 'is-active' : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(h);
            }}
          >
            {highlightParts(placeLabel(h), hitsFor).map((part, k) => (part.hit ? <mark key={k}>{part.text}</mark> : <span key={k}>{part.text}</span>))}
          </div>
        ))}
      </div>
      {noHit && <p className="error" id={`${uid}-none`}>{t('psPlaceNone')}</p>}
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}
