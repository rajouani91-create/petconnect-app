import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf } from '../../i18n';
import { ApiError, completeReminder, listAppointments, type AppointmentRow } from '../../lib/api';
import { APPT_KIND_LABEL, completeErrorKey, formatDateTime, groupReminders, isApptKind, splitAppointments } from '../../lib/schedule';
import { DerivedItem, ReminderItem, useReminders } from '../../pages/Reminders';
import { derivedVaccReminders } from '../../lib/schedule';
import { useFocusAfter } from '../record/shared';
import { useLocalToday, usePetAccess } from './shared';

const UPCOMING_MAX = 3;

/**
 * Übersicht: die nächsten 3 Termine und alle überfälligen oder heute fälligen Erinnerungen (alle Tiere).
 * Meldungen gehen an die Statuszeile der Seite (`onStatus`), damit es nur eine Live-Region gibt.
 */
export function UpcomingCard({ onStatus }: { onStatus: (text: string) => void }) {
  const { t, lang } = useI18n();
  const locale = localeOf(lang);
  const today = useLocalToday();
  const { pets, names, editable } = usePetAccess();
  const { rows, setRows, vaccs } = useReminders();
  const [appts, setAppts] = useState<AppointmentRow[] | null>(null);
  const { register, focusLater } = useFocusAfter();

  const petKey = pets.map((p) => p.id).join(',');
  const loadAppts = useCallback(async () => {
    try {
      setAppts(await listAppointments(petKey ? petKey.split(',') : []));
    } catch (e) {
      console.error(e);
      setAppts([]);
    }
  }, [petKey]);
  useEffect(() => {
    void loadAppts();
  }, [loadAppts]);

  if (!rows || !appts) return null;
  const next = splitAppointments(appts, today).upcoming.slice(0, UPCOMING_MAX);
  const g = groupReminders(rows, today);
  const due = [...g.overdue, ...g.today];
  const derived = derivedVaccReminders(vaccs, today).filter((d) => d.group === 'overdue' || d.group === 'today');

  async function complete(id: string, title: string) {
    try {
      const updated = await completeReminder(id, today);
      setRows((cur) => (cur ?? []).map((r) => (r.id === updated.id ? updated : r)));
      onStatus(updated.repeat_days === null ? t('rmDoneOnce') : t('rmDoneNext', { d: formatIsoDateShort(updated.due_on, lang) }));
    } catch (e) {
      console.error(e instanceof ApiError ? e.message : e);
      onStatus(t(e instanceof ApiError ? completeErrorKey(e.message) : 'errGeneric', { x: title }));
    }
    focusLater('rem-link');
  }

  return (
    <section className="card stack upcoming-card" aria-labelledby="up-h">
      <h2 id="up-h">{t('upTitle')}</h2>

      <div className="stack">
        <h3>{t('apNext')}</h3>
        {next.length === 0 ? (
          <p className="muted">{t('apNone')}</p>
        ) : (
          <ul className="record-list">
            {next.map((a) => (
              <li key={a.id} className="record-row appt-row">
                <span className="date-block" aria-hidden="true">
                  <span className="date-block-mon">{new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(a.starts_at))}</span>
                  <span className="date-block-day">{new Date(a.starts_at).getDate()}</span>
                </span>
                <div className="record-main">
                  <span className="appt-when mono">{formatDateTime(a.starts_at, locale)}</span>
                  <span className="record-title">{a.title}</span>
                  <span className="muted small">{[isApptKind(a.kind) ? t(APPT_KIND_LABEL[a.kind]) : a.kind, names.get(a.pet_id), a.location].filter(Boolean).join(' · ')}</span>
                  {a.location && (
                    <span className="appt-nav small">
                      <a className="link" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.location)}`} target="_blank" rel="noopener noreferrer">Google Maps</a>
                      <a className="link" href={`https://maps.apple.com/?daddr=${encodeURIComponent(a.location)}`} target="_blank" rel="noopener noreferrer">Apple Maps</a>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link to="/termine" className="link">{t('upToAppts')}</Link>
      </div>

      <div className="stack">
        <h3>{t('upDueRem')}</h3>
        {due.length === 0 && derived.length === 0 ? (
          <p className="muted">{t('upNoDue')}</p>
        ) : (
          <ul className="record-list">
            {derived.map((d) => <DerivedItem key={`v-${d.id}`} d={d} today={today} petName={names.get(d.petId) ?? ''} />)}
            {due.map((r) => (
              <ReminderItem
                key={r.id}
                r={r}
                today={today}
                done={false}
                compact
                petName={names.get(r.pet_id) ?? ''}
                canChange={editable.has(r.pet_id)}
                register={register}
                onComplete={() => void complete(r.id, r.title)}
              />
            ))}
          </ul>
        )}
        <Link to="/erinnerungen" ref={register('rem-link')} className="link">{t('upToRem')}</Link>
      </div>
    </section>
  );
}
