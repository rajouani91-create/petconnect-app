// Tieransicht, Reiter „Übersicht“ (Release C): Heute (Gaben), nächster Termin, Kacheln.
import { useEffect, useState, type ReactNode } from 'react';
import { VACC_LABEL } from '../VaccChip';
import type { VaccStatus } from '../../lib/record';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate, localeOf } from '../../i18n';
import { listAppointments, type AppointmentRow } from '../../lib/api';
import { doseKey, nextOpenDose } from '../../lib/medication';
import { nextAppointment } from '../../lib/petSummary';
import { timeOf } from '../../lib/practiceAppointments';
import { useNow } from '../../lib/useNow';
import { useTodayDoses } from '../schedule/TodayMeds';
import { IconCalendar, IconChart, IconChevron, IconEmergency, IconList, IconReceipt, IconShield, KindIcon } from '../Icons';

/** „Heute“ kurz: Stand der Gaben dieses Tieres und die nächste; abgehakt wird auf „Heute“ (keine zweite Liste) */
export function PetToday({ petId }: { petId: string }) {
  const { t } = useI18n();
  const d = useTodayDoses();
  const mine = d.planned.filter((p) => p.med.pet_id === petId);
  if (!d.data || mine.length === 0) return null;
  const given = mine.filter((p) => d.data!.doses.has(doseKey(p.med.id, d.day, p.time))).length;
  const next = nextOpenDose(mine, d.data.doses, d.day);
  return (
    <section className="card pet-today" aria-labelledby={`today-${petId}`}>
      <div className="today-progress">
        <h2 id={`today-${petId}`} className="pet-today-h">{t('petTodayH')}</h2>
        <progress max={mine.length} value={given} aria-labelledby={`today-${petId} today-n-${petId}`} />
        <span id={`today-n-${petId}`} className="small">{t('ptDoses', { done: given, total: mine.length })}</span>
      </div>
      <p className="small muted">
        {next ? t('ptNextDose', { t: next.time, m: next.med.name }) : t('ptAllGiven')}
        {' · '}<Link to="/" className="link">{t('ptToToday')}</Link>
      </p>
    </section>
  );
}

/** Nächster Termin des Tieres als Karte; ohne Termin ein Knopf zum Buchen */
export function PetNextAppointment({ petId, canBook }: { petId: string; canBook: boolean }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const now = useNow();
  const [rows, setRows] = useState<AppointmentRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    listAppointments([petId])
      .then((r) => { if (alive) setRows(r); })
      .catch((e: unknown) => { console.error(e); if (alive) setRows([]); });
    return () => { alive = false; };
  }, [petId]);
  if (!rows) return null;
  const next = nextAppointment(rows, now);
  if (!next) {
    return canBook ? (
      <Link to="/termine/buchen" className="btn btn-secondary btn-start"><IconCalendar size={20} />{t('obBookCta')}</Link>
    ) : null;
  }
  const d = new Date(next.starts_at);
  return (
    <Link to="/termine" className="card next-appt" aria-label={t('petNextApptL', { d: `${formatDate(d, lang, { weekday: 'long', day: 'numeric', month: 'long' })}, ${timeOf(next.starts_at)}`, x: next.title })}>
      <span className="date-block" aria-hidden="true">
        <span className="date-block-mon">{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)}</span>
        <span className="date-block-day">{new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'Europe/Berlin' }).format(d)}</span>
      </span>
      <span className="next-appt-text">
        <span className="next-appt-title">{t('petNextAppt', { t: timeOf(next.starts_at) })}{next.practice_appointment_id && <span className="pill pill-brand">{t('ptPracticeAppt')}</span>}</span>
        <span className="small muted">{[next.title, next.location].filter(Boolean).join(' · ')}</span>
      </span>
      <IconChevron size={20} />
    </Link>
  );
}

/** Kacheln zu den Bereichen der Tierakte, mit kurzem Stand (Impfungen, aktive Medikamente, Gewicht) */
export function PetTiles({ petId, vacc, kg }: { petId: string; vacc?: VaccStatus; kg?: number | null }) {
  const { t, lang } = useI18n();
  const d = useTodayDoses();
  const active = d.data ? d.data.meds.filter((m) => m.pet_id === petId && !m.stopped_on && (!m.ends_on || m.ends_on >= d.day)).length : null;
  const tiles: { to: string | { hash: string }; icon: ReactNode; label: string; sub?: string; warn?: boolean }[] = [
    { to: { hash: 'impfungen' }, icon: <IconShield size={26} />, label: t('petTileVacc'), sub: vacc ? t(VACC_LABEL[vacc]) : undefined, warn: vacc === 'expired' || vacc === 'soon' },
    { to: { hash: 'medikation' }, icon: <KindIcon kind="med" size={26} />, label: t('petTileMed'), sub: active === null ? undefined : active > 0 ? t('ptMedActive', { n: active }) : t('ptMedNone') },
    { to: { hash: 'vitalwerte' }, icon: <IconChart size={26} />, label: t('petTileVitals'), sub: kg ? `${new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: 1 }).format(kg)} kg` : undefined },
    { to: { hash: 'dokumente' }, icon: <IconList size={26} />, label: t('petTileDocs') },
    { to: '/mehr/rechnungen', icon: <IconReceipt size={26} />, label: t('petTileInvoices') },
    { to: `/tier/${encodeURIComponent(petId)}/notfallkarte`, icon: <IconEmergency size={26} />, label: t('mCard') },
  ];
  return (
    <ul className="quick-grid pet-tiles">
      {tiles.map((x) => (
        <li key={x.label}>
          <Link to={x.to} className="quick-btn">
            {x.icon}
            <span>{x.label}</span>
            {x.sub && <small className={`tile-sub${x.warn ? ' is-warn' : ''}`}>{x.sub}</small>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
