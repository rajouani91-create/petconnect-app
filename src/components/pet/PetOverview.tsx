// Tieransicht, Reiter „Übersicht“ (Release C): Heute (Gaben), nächster Termin, Kacheln.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate, localeOf } from '../../i18n';
import { listAppointments, type AppointmentRow } from '../../lib/api';
import { doseKey } from '../../lib/medication';
import { nextAppointment } from '../../lib/petSummary';
import { timeOf } from '../../lib/practiceAppointments';
import { useNow } from '../../lib/useNow';
import { DoseItem, useDoseActions, useTodayDoses } from '../schedule/TodayMeds';
import { StatusLine, useFocusAfter, useStatus } from '../record/shared';
import { IconCalendar, IconChart, IconChevron, IconEmergency, IconList, IconReceipt, IconShield, KindIcon } from '../Icons';

/** „Heute“: Gaben dieses Tieres zum Abhaken; nichts, wenn heute keine Gabe geplant ist */
export function PetToday({ petId }: { petId: string }) {
  const { t } = useI18n();
  const d = useTodayDoses();
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();
  const actions = useDoseActions(d, setStatus, focusLater);
  const mine = d.planned.filter((p) => p.med.pet_id === petId);
  if (!d.data || mine.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby={`today-${petId}`}>
      <h2 id={`today-${petId}`}>{t('petTodayH')}</h2>
      <ul className="record-list">
        {mine.map((p) => <DoseItem key={doseKey(p.med.id, d.day, p.time)} p={p} d={d} actions={actions} register={register} />)}
      </ul>
      <StatusLine status={status} />
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
        <span className="next-appt-title">{t('petNextAppt', { t: timeOf(next.starts_at) })}</span>
        <span className="small muted">{[next.title, next.location].filter(Boolean).join(' · ')}</span>
      </span>
      <IconChevron size={20} />
    </Link>
  );
}

/** Kacheln zu den Bereichen der Tierakte */
export function PetTiles({ petId }: { petId: string }) {
  const { t } = useI18n();
  const tiles = [
    { to: { hash: 'impfungen' }, icon: <IconShield size={26} />, label: t('petTileVacc') },
    { to: { hash: 'medikation' }, icon: <KindIcon kind="med" size={26} />, label: t('petTileMed') },
    { to: { hash: 'vitalwerte' }, icon: <IconChart size={26} />, label: t('petTileVitals') },
    { to: { hash: 'dokumente' }, icon: <IconList size={26} />, label: t('petTileDocs') },
    { to: '/mehr/rechnungen', icon: <IconReceipt size={26} />, label: t('petTileInvoices') },
    { to: `/tier/${encodeURIComponent(petId)}/notfallkarte`, icon: <IconEmergency size={26} />, label: t('mCard') },
  ];
  return (
    <ul className="quick-grid pet-tiles">
      {tiles.map((x) => (
        <li key={x.label}><Link to={x.to} className="quick-btn">{x.icon}{x.label}</Link></li>
      ))}
    </ul>
  );
}
