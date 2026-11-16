import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate } from '../i18n';
import { useNow } from '../lib/useNow';
import { zonedNow } from '../lib/time';
import { practiceSchedule, type PracticeSchedule as Schedule } from '../lib/practiceSchedule';
import { STATUS_LABEL, STATUS_TONE, endOf, practiceAppointments, timeOf, type PracticeAppointment } from '../lib/practiceAppointments';
import { capacity, dayStatus, noShowRate, onDay, weekDays } from '../lib/practiceCalendar';
import { practiceInquiries, type PracticeInquiry } from '../lib/inquiries';
import { PracticeProfile } from './PracticeProfile';
import { usePractice } from './PracticeProvider';

/** Startseite der Praxis: Termine heute, neue Online-Buchungen, Ausfallquote, Auslastung der Woche */
export function PracticeHome() {
  const { me } = usePractice();
  // Noch nicht freigeschaltet: weiter das Praxisprofil als Startseite
  return me?.practice?.status === 'active' ? <PracticeToday /> : <PracticeProfile />;
}

function PracticeToday() {
  const { t, lang } = useI18n();
  const { me } = usePractice();
  const now = useNow();
  const today = zonedNow(now).date;
  const [rows, setRows] = useState<PracticeAppointment[] | null>(null);
  const [sched, setSched] = useState<Schedule | null>(null);
  const [asks, setAsks] = useState<PracticeInquiry[]>([]);
  const [err, setErr] = useState(false);

  useEffect(() => {
    Promise.all([practiceAppointments(), practiceSchedule(), practiceInquiries().catch(() => [] as PracticeInquiry[])])
      .then(([a, s, q]) => { setRows(a); setSched(s); setAsks(q.filter((x) => x.status === 'open')); })
      .catch(() => setErr(true));
  }, []);

  const name = me?.practice?.name ?? '';
  const head = (
    <div className="page-head">
      <h1>{t('tpTitle', { p: name })}</h1>
      <p className="muted">{t('tpSub')}</p>
    </div>
  );
  if (err) return <div className="page stack-lg">{head}<p className="notice notice-crit" role="alert">{t('errGeneric')}</p></div>;
  if (!rows || !sched) return <div className="page stack-lg">{head}<p className="muted">{t('loading')}</p></div>;

  const todays = onDay(rows, today);
  const online = todays.filter((a) => a.source === 'online').length;
  const fresh = rows.filter((a) => a.status === 'new');
  const ns = noShowRate(rows, now);
  const week = weekDays(today).map((d) => ({ d, s: dayStatus(d, sched.hours, sched.absences) })).filter((x) => x.s.kind !== 'closed' || onDay(rows, x.d).length > 0);
  const pct = (x: number) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(x);
  const pct1 = (x: number) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 1 }).format(x);

  return (
    <div className="page stack-lg">
      {head}
      {fresh.length > 0 && (
        <div className="notice notice-warn tp-new">
          <span>{t('tpNew', { n: fresh.length })}</span>
          <Link to="/praxis/termine?filter=new" className="btn btn-primary">{t('tpView')}</Link>
        </div>
      )}
      {asks.length > 0 && (
        <div className={`notice ${asks.some((x) => x.urgency === 'emergency') ? 'notice-crit' : 'notice-info'} tp-new`}>
          <span>{asks.some((x) => x.urgency === 'emergency') ? t('tpAsksEmergency', { n: asks.length }) : t('tpAsks', { n: asks.length })}</span>
          <Link to="/praxis/anfragen" className="btn btn-secondary">{t('tpView')}</Link>
        </div>
      )}
      <div className="tp-kpis">
        <section className="card tp-kpi">
          <h2 className="small muted">{t('tpToday')}</h2>
          <p className="tp-num">{todays.length}</p>
          <p className="small muted">{t('tpOnline', { n: online })}</p>
        </section>
        <section className="card tp-kpi">
          <h2 className="small muted">{t('tpNewKpi')}</h2>
          <p className="tp-num">{fresh.length}</p>
          <p className="small muted">{t('tpNewKpiSub')}</p>
        </section>
        <section className="card tp-kpi">
          <h2 className="small muted">{t('tpNoShow')}</h2>
          <p className="tp-num">{ns.rate === null ? '–' : pct1(ns.rate)}</p>
          <p className="small muted">{ns.total ? t('tpNoShowSub', { a: ns.noShow, b: ns.total }) : t('tpNoShowNone')}</p>
        </section>
      </div>
      <div className="tp-cols">
        <section className="card stack" aria-labelledby="tp-list">
          <div className="tp-list-head">
            <h2 id="tp-list">{formatDate(now, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
            <Link to="/praxis/kalender?ansicht=day" className="link">{t('calTitle')}</Link>
          </div>
          {todays.length === 0 ? <p className="muted">{t('tpNone')}</p> : (
            <ul className="record-list">
              {todays.map((a) => (
                <li key={a.id} className="record-row">
                  <span className="appt-time mono">{timeOf(a.starts_at)}<span className="muted small">–{timeOf(endOf(a))}</span></span>
                  <div className="record-main">
                    <span className="record-title">{a.pet_label} <span className="muted">· {a.owner_label}</span></span>
                    <span className="small">{a.type_name}</span>
                  </div>
                  <span className="cal-tags">
                    <span className={`pill ${STATUS_TONE[a.status]}`}>{t(STATUS_LABEL[a.status])}</span>
                    {a.new_client && <span className="pill pill-accent">{t('bkNewClient')}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card stack" aria-labelledby="tp-cap">
          <h2 id="tp-cap">{t('tpCapacity')}</h2>
          <ul className="tp-bars">
            {week.map(({ d, s }) => {
              const c = capacity(d, s, rows);
              const label = formatDate(new Date(`${d}T12:00:00Z`), lang, { weekday: 'short', timeZone: 'UTC' });
              return (
                <li key={d} className={`tp-bar${c !== null && c > 0.85 ? ' is-high' : ''}${d === today ? ' is-today' : ''}`}>
                  <span className="tp-bar-day">{label}</span>
                  <span className="tp-bar-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((c ?? 0) * 100)} aria-label={label}>
                    <span className="tp-bar-fill" style={{ width: `${Math.round((c ?? 0) * 100)}%` }} />
                  </span>
                  <span className="tp-bar-val mono">{c === null ? t('scClosed') : pct(c)}</span>
                </li>
              );
            })}
          </ul>
          <p className="muted small note-line">{t('tpCapNote')}</p>
        </section>
      </div>
    </div>
  );
}
