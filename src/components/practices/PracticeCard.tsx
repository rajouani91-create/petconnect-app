import { useI18n } from '../../i18n/I18nProvider';
import { localeOf } from '../../i18n';
import { telHref } from '../../lib/care';
import { openingText, type OpeningInfo } from '../../lib/openingHours';
import { FEATURE_TEXT, SERVICE_TEXT, SPECIES_TEXT, TITLE_TEXT, isPracticeFeature, isPracticeService, isPracticeSpecies, isPracticeTitle, languageName } from '../../lib/practiceCatalog';
import { formatAddress, formatKm, isAppleDevice, osmNoteLink, routeLinks, safeWebsite } from '../../lib/practices';
import { Link } from 'react-router';
import { IconCalendar, IconPhone } from '../Icons';
import { formatDate } from '../../i18n';
import { timeOf } from '../../lib/practiceAppointments';
import type { PracticeBookingInfo } from '../../lib/booking';

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
  languages?: string[];
  features?: string[];
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
  nameHint = null,
  now,
  onFavorite,
  onSetVet,
  onInvite,
  registerFocus,
  booking = null,
}: {
  p: PracticeView;
  info: OpeningInfo | null;
  favorite: boolean;
  invited: boolean;
  canSetVet: boolean;
  showOfferUnknown: boolean;
  /** Name deutet auf die gewählte Tierart hin (nur Praxen ohne Profil) – Text der Tierart */
  nameHint?: string | null;
  /** Für „öffnet {Tag}“ */
  now: Date;
  onFavorite: () => void;
  onSetVet: () => void;
  onInvite: () => void;
  registerFocus: (key: string) => (el: HTMLElement | null) => void;
  /** Registrierte Praxis: online buchbar und nächster freier Termin (Release C) */
  booking?: PracticeBookingInfo | null;
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
  const badge = (i: OpeningInfo) => {
    const o = openingText(i, now);
    if (o.key === 'psOpensDay') return t(o.key, { x: o.x, d: new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(o.day) });
    return 'x' in o ? t(o.key, { x: o.x }) : t(o.key);
  };

  return (
    <li className={`card stack practice-card${p.registered ? ' is-pc' : ''}`} aria-labelledby={headingId}>
      <div className="practice-head">
        <h3 id={headingId}>{p.name}</h3>
        {typeof p.distance_km === 'number' && <span className="pill">{formatKm(p.distance_km, locale)}</span>}
      </div>
      {addr && <p className="muted">{addr}</p>}
      {p.registered ? (
        <div className="pc-book stack-sm">
          <p className="pc-badges">
            <span className="pill pill-ok">{t('nbReg')}</span>
            {booking?.online && <span className="pill pill-brand">{t('psOnlineBookable')}</span>}
          </p>
          {booking?.online && booking.next_slot && (
            <p className="small">{t('psNextFree')} <strong>{formatDate(new Date(booking.next_slot), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, {timeOf(booking.next_slot)}</strong></p>
          )}
          {booking?.online ? (
            <Link className="btn btn-primary pc-cta" to={`/termine/buchen?praxis=${booking.practice_id}`} aria-label={t('psBookL', { x: p.name })}>
              <IconCalendar size={18} />
              {t('psBook')}
            </Link>
          ) : (
            <Link className="btn btn-secondary pc-cta" to="/mehr/anfragen" aria-label={t('psAskL', { x: p.name })}>{t('psAsk')}</Link>
          )}
        </div>
      ) : (
        <p className="small practice-reg">{t('nbNot')}</p>
      )}

      {info && (
        <p className="small">
          <span className={`pill oh-${info.state}`}>{badge(info)}</span>
          {info.today && info.today.length > 0 && <span className="muted"> {t('psToday', { x: info.today.map(([a, b]) => `${a}–${b}`).join(', ') })}</span>}
          {info.today && info.today.length === 0 && info.state !== 'unknown' && <span className="muted"> {t('psTodayClosed')}</span>}
          {info.comment && <span className="oh-comment"> {t('psHoursNote', { x: info.comment })}</span>}
        </p>
      )}

      {p.has_profile ? (
        <div className="stack practice-offer">
          {treats && <p className="small">{t('psTreats', { x: treats })}</p>}
          {offers && <p className="small">{t('psOffers', { x: offers })}</p>}
          {p.focus && p.focus.length > 0 && <p className="small">{t('psFocus', { a: p.focus.join(', ') })}</p>}
          {p.languages && p.languages.length > 0 && <p className="small">{t('psLangs', { x: p.languages.map((l) => languageName(l, locale)).join(', ') })}</p>}
          {p.features && p.features.some(isPracticeFeature) && <p className="small">{t('psFeats', { x: p.features.filter(isPracticeFeature).map((f) => t(FEATURE_TEXT[f])).join(', ') })}</p>}
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
      {!p.has_profile && nameHint && <p className="small notice notice-info name-hint">{t('psNameHint', { a: nameHint })}</p>}

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
