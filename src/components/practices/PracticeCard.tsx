import { useI18n } from '../../i18n/I18nProvider';
import { localeOf } from '../../i18n';
import { telHref } from '../../lib/care';
import type { OpeningInfo } from '../../lib/openingHours';
import { SERVICE_TEXT, SPECIES_TEXT, TITLE_TEXT, isPracticeService, isPracticeSpecies, isPracticeTitle } from '../../lib/practiceCatalog';
import { formatAddress, formatKm, isAppleDevice, osmNoteLink, routeLinks, safeWebsite } from '../../lib/practices';
import { IconPhone } from '../Icons';

export interface PracticeView {
  id: string;
  name: string;
  street: string | null;
  housenumber: string | null;
  postcode: string | null;
  city: string | null;
  lat: number;
  lon: number;
  phone: string | null;
  website: string | null;
  registered: boolean;
  distance_km?: number;
  has_profile?: boolean;
  species?: string[];
  services?: string[];
  titles?: string[];
  focus?: string[];
  titles_verified?: boolean;
}

/** Eine Praxis in der Liste: Grunddaten aus OSM, Angebot nur mit Profil, Aktionen. */
export function PracticeCard({
  p,
  info,
  favorite,
  invited,
  canSetVet,
  showOfferUnknown,
  onFavorite,
  onSetVet,
  onInvite,
  registerFocus,
}: {
  p: PracticeView;
  info: OpeningInfo | null;
  favorite: boolean;
  invited: boolean;
  canSetVet: boolean;
  showOfferUnknown: boolean;
  onFavorite: () => void;
  onSetVet: () => void;
  onInvite: () => void;
  registerFocus: (key: string) => (el: HTMLElement | null) => void;
}) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const addr = formatAddress(p);
  const tel = p.phone ? telHref(p.phone) : null;
  const web = safeWebsite(p.website);
  const routes = routeLinks(p.lat, p.lon, p.name);
  const apple = typeof navigator !== 'undefined' && isAppleDevice(navigator.userAgent, navigator.platform);
  const label = (list: string[] | undefined, isKey: (v: unknown) => boolean, text: Record<string, Parameters<typeof t>[0]>) =>
    (list ?? []).filter(isKey).map((k) => t(text[k]!)).join(', ');
  const treats = label(p.species, isPracticeSpecies, SPECIES_TEXT);
  const offers = label(p.services, isPracticeService, SERVICE_TEXT);
  const titles = (p.titles ?? []).filter(isPracticeTitle);
  const headingId = `pr-${p.id}`;

  return (
    <li className="card stack practice-card" aria-labelledby={headingId}>
      <div className="practice-head">
        <h3 id={headingId}>{p.name}</h3>
        {typeof p.distance_km === 'number' && <span className="pill">{formatKm(p.distance_km, locale)}</span>}
      </div>
      {addr && <p className="muted">{addr}</p>}
      <p className={`small practice-reg${p.registered ? ' is-reg' : ''}`}>{t(p.registered ? 'nbReg' : 'nbNot')}</p>

      {info && (
        <p className="small">
          <span className={`pill oh-${info.state}`}>{t(info.state === 'open' ? 'psOpenNow' : info.state === 'closed' ? 'psClosedNow' : 'psHoursUnknown')}</span>
          {info.today && info.today.length > 0 && <span className="muted"> {t('psToday', { x: info.today.map(([a, b]) => `${a}–${b}`).join(', ') })}</span>}
          {info.today && info.today.length === 0 && info.state !== 'unknown' && <span className="muted"> {t('psTodayClosed')}</span>}
        </p>
      )}

      {p.has_profile ? (
        <div className="stack practice-offer">
          {treats && <p className="small">{t('psTreats', { x: treats })}</p>}
          {offers && <p className="small">{t('psOffers', { x: offers })}</p>}
          {p.focus && p.focus.length > 0 && <p className="small">{t('psFocus', { a: p.focus.join(', ') })}</p>}
          {titles.length > 0 && (
            <ul className="title-list">
              {titles.map((k) => (
                <li key={k} className="small">
                  {t(TITLE_TEXT[k])} <span className={`pill ${p.titles_verified ? 'pill-ok' : ''}`}>{t(p.titles_verified ? 'psVerified' : 'psSelfReported')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        showOfferUnknown && <p className="small muted">{t('psUnknown')}</p>
      )}

      <div className="row-actions practice-actions">
        {tel && (
          <a className="btn btn-secondary" href={tel} aria-label={t('psCallL', { x: p.name })}>
            <IconPhone size={18} />
            {t('nbCall')}
          </a>
        )}
        <a className="btn btn-ghost" href={routes.osm} target="_blank" rel="noopener noreferrer" aria-label={t('psRouteOsmL', { x: p.name })}>{t('nbRoute')}</a>
        <a className="btn btn-ghost" href={routes.google} target="_blank" rel="noopener noreferrer" aria-label={t('psRouteGoogleL', { x: p.name })}>{t('psGoogle')}</a>
        {apple && <a className="btn btn-ghost" href={routes.apple} aria-label={t('psRouteAppleL', { x: p.name })}>{t('psApple')}</a>}
        {web && <a className="btn btn-ghost" href={web} target="_blank" rel="noopener noreferrer" aria-label={t('psWebL', { x: p.name })}>{t('psWeb')}</a>}
        <button type="button" className="btn btn-ghost fav-btn" aria-pressed={favorite} aria-label={t('psFavL', { x: p.name })} onClick={onFavorite} ref={registerFocus(`fav-${p.id}`)}>
          <span aria-hidden="true">{favorite ? '★' : '☆'}</span>
          {t('nbFav')}
        </button>
        {canSetVet && (
          <button type="button" className="btn btn-ghost" aria-label={t('psSetVetL', { x: p.name })} onClick={onSetVet} ref={registerFocus(`vet-${p.id}`)}>
            {t('psSetVet')}
          </button>
        )}
        {!p.registered && (
          <button type="button" className="btn btn-ghost" disabled={invited} aria-label={t(invited ? 'psInvitedL' : 'psInviteL', { x: p.name })} onClick={onInvite} ref={registerFocus(`inv-${p.id}`)}>
            {t(invited ? 'nbInvited' : 'nbInvite')}
          </button>
        )}
      </div>
      <p className="small">
        <a className="link" href={osmNoteLink(p.lat, p.lon)} target="_blank" rel="noopener noreferrer" aria-label={t('psReportL', { x: p.name })}>{t('psReport')}</a>
      </p>
    </li>
  );
}
