import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { IconBack } from '../components/Icons';
import { formatIsoDate, localeOf, type MessageKey } from '../i18n';
import { Field } from '../components/Field';
import { Switch } from '../components/Switch';
import { zonedNow } from '../lib/time';
import { useNow } from '../lib/useNow';
import {
  MINUTES, TYPE_NAME_MAX, WEEKS_AHEAD, absenceError, addAbsence, dayError, dayText, practiceSchedule, removeAbsence, removeAppointmentType, saveAppointmentType,
  saveHours, scheduleErrorKey, setBookingWindow, weekdayName, type AppointmentType, type DayHours, type PracticeSchedule as Schedule,
} from '../lib/practiceSchedule';
import { usePractice } from './PracticeProvider';

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

/** Termine der Praxis – in Etappe P5a die Einstellungen: Sprechzeiten, Terminarten, Abwesenheiten, Buchungsfenster. */
export function PracticeSchedule() {
  const { t } = useI18n();
  const { me } = usePractice();
  const pending = me?.practice?.status === 'pending';
  const [data, setData] = useState<Schedule | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await practiceSchedule());
      setLoadErr(false);
    } catch {
      setLoadErr(true);
    }
  }, []);
  useEffect(() => {
    if (!pending) void load();
  }, [load, pending]);

  const run: Run = useCallback(async (fn, ok) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ ok: true, text: ok });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: t(scheduleErrorKey(e)) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [load, t]);

  return (
    <div className="page stack-lg">
      <Link to="/praxis/termine" className="back-link"><IconBack size={20} />{t('scTitle')}</Link>
      <div className="page-head">
        <h1>{t('bkSettings')}</h1>
        <p className="muted">{t('scIntro')}</p>
      </div>
      {pending ? (
        <div className="notice notice-warn" role="status">
          <p><strong>{t('pp_pendingTitle')}</strong></p>
          <p>{t('scPending')}</p>
        </div>
      ) : loadErr && !data ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !data ? <p className="muted">{t('loading')}</p> : (
        <>
          {!data.can_edit && <p className="notice notice-info">{t('scReadOnly')}</p>}
          <div className="record-status" role="status" aria-live="polite">
            {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}
          </div>
          <HoursCard key={JSON.stringify(data.hours)} data={data} busy={busy} run={run} />
          <TypesCard data={data} busy={busy} run={run} />
          <AbsencesCard data={data} busy={busy} run={run} />
          <WindowCard data={data} busy={busy} run={run} />
        </>
      )}
    </div>
  );
}

interface CardProps { data: Schedule; busy: boolean; run: Run }

function HoursCard({ data, busy, run }: CardProps) {
  const { t, lang } = useI18n();
  const uid = useId();
  const locale = localeOf(lang);
  const [hours, setHours] = useState<DayHours[]>(data.hours);
  const [errors, setErrors] = useState<Record<number, MessageKey>>({});
  const set = (weekday: number, patch: Partial<DayHours>) => setHours((cur) => cur.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  const dirty = JSON.stringify(hours) !== JSON.stringify(data.hours);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<number, MessageKey> = {};
    for (const d of hours) {
      const x = dayError(d);
      if (x) errs[d.weekday] = x;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await run(() => saveHours(hours), t('scHoursSaved'));
  }

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('scHours')}</h2>
      {!data.can_edit ? (
        <dl className="kv">
          {data.hours.map((d) => (
            <div key={d.weekday} className="kv-pair">
              <dt>{weekdayName(d.weekday, locale)}</dt>
              <dd>{dayText(d, t('scClosed'))}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <ul className="hours-list">
            {hours.map((d) => {
              const name = weekdayName(d.weekday, locale);
              const hasBreak = d.break_from !== null || d.break_to !== null;
              const err = errors[d.weekday];
              return (
                <li key={d.weekday} className="hours-row">
                  <div className="hours-day">
                    <Switch label={name} checked={d.open} onChange={(on) => set(d.weekday, { open: on })} />
                  </div>
                  {d.open ? (
                    <div className="hours-times">
                      <label className="sr-only" htmlFor={`${uid}-o-${d.weekday}`}>{t('scFromL', { d: name })}</label>
                      <input id={`${uid}-o-${d.weekday}`} type="time" value={d.opens} aria-invalid={!!err} onChange={(e) => set(d.weekday, { opens: e.target.value })} />
                      <span aria-hidden="true">–</span>
                      <label className="sr-only" htmlFor={`${uid}-c-${d.weekday}`}>{t('scToL', { d: name })}</label>
                      <input id={`${uid}-c-${d.weekday}`} type="time" value={d.closes} aria-invalid={!!err} onChange={(e) => set(d.weekday, { closes: e.target.value })} />
                      {hasBreak ? (
                        <>
                          <span className="muted small">{t('scBreak')}</span>
                          <label className="sr-only" htmlFor={`${uid}-bf-${d.weekday}`}>{t('scBreakFromL', { d: name })}</label>
                          <input id={`${uid}-bf-${d.weekday}`} type="time" value={d.break_from ?? ''} aria-invalid={err === 'scErrBreak'} onChange={(e) => set(d.weekday, { break_from: e.target.value })} />
                          <span aria-hidden="true">–</span>
                          <label className="sr-only" htmlFor={`${uid}-bt-${d.weekday}`}>{t('scBreakToL', { d: name })}</label>
                          <input id={`${uid}-bt-${d.weekday}`} type="time" value={d.break_to ?? ''} aria-invalid={err === 'scErrBreak'} onChange={(e) => set(d.weekday, { break_to: e.target.value })} />
                          <button type="button" className="link-btn small" onClick={() => set(d.weekday, { break_from: null, break_to: null })}>{t('scBreakRemove')}</button>
                        </>
                      ) : (
                        <button type="button" className="link-btn small" onClick={() => set(d.weekday, { break_from: '12:00', break_to: '14:00' })}>{t('scBreakAdd')}</button>
                      )}
                    </div>
                  ) : <span className="muted">{t('scClosed')}</span>}
                  {err && <p className="error hours-err" role="alert">{t(err)}</p>}
                </li>
              );
            })}
          </ul>
          <button type="submit" className="btn btn-primary btn-start" disabled={busy || !dirty}>{t('scHoursSave')}</button>
        </form>
      )}
    </section>
  );
}

function TypesCard({ data, busy, run }: CardProps) {
  const { t } = useI18n();
  const uid = useId();
  const [edit, setEdit] = useState<AppointmentType | null>(null);
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(20);
  const [online, setOnline] = useState(true);
  const [nameErr, setNameErr] = useState(false);

  function start(type: AppointmentType | null) {
    setEdit(type);
    setName(type?.name ?? '');
    setMinutes(type?.minutes ?? 20);
    setOnline(type?.online ?? true);
    setNameErr(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    setNameErr(false);
    if (await run(() => saveAppointmentType(edit?.id ?? null, name, minutes, online), t('scTypeSaved', { n: name.trim() }))) start(null);
  }

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('scTypes')}</h2>
      <ul className="record-list">
        {data.types.map((type) => (
          <li key={type.id} className="record-row">
            <div className="record-main">
              <span className="record-title">{type.name}</span>
              <span className="muted small">{t('scMinutes', { n: type.minutes })} · {t(type.online ? 'scOnline' : 'scNotOnline')}</span>
            </div>
            {data.can_edit && (
              <div className="row-actions">
                <button type="button" className="btn btn-ghost" aria-label={t('rcEditL', { n: type.name })} onClick={() => start(type)}>{t('editBtn')}</button>
                <button type="button" className="btn btn-ghost" disabled={busy || data.types.length <= 1} aria-label={t('scRemoveL', { n: type.name })}
                  onClick={() => void run(() => removeAppointmentType(type.id), t('scTypeRemoved', { n: type.name }))}>{t('pnRemove')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {data.can_edit && (
        <form className="stack type-form" onSubmit={(e) => void submit(e)} noValidate>
          <h3 className="h-sub">{edit ? t('scTypeEdit', { n: edit.name }) : t('scTypeAdd')}</h3>
          <div className="row-2">
            <Field id={`${uid}-name`} label={t('scTypeName')} error={nameErr ? { key: 'scErrTypeName' } : undefined} required>
              {(a) => <input {...a} type="text" maxLength={TYPE_NAME_MAX} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field id={`${uid}-min`} label={t('scDuration')}>
              {(a) => (
                <select {...a} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  {MINUTES.map((m) => <option key={m} value={m}>{t('scMinutes', { n: m })}</option>)}
                </select>
              )}
            </Field>
          </div>
          <Switch label={t('scOnlineSwitch')} checked={online} onChange={setOnline} />
          <div className="row-actions">
            <button type="submit" className="btn btn-secondary" disabled={busy}>{edit ? t('saveBtn') : t('scTypeAddBtn')}</button>
            {edit && <button type="button" className="btn btn-ghost" onClick={() => start(null)}>{t('cancelBtn')}</button>}
          </div>
        </form>
      )}
    </section>
  );
}

function AbsencesCard({ data, busy, run }: CardProps) {
  const { t, lang } = useI18n();
  const uid = useId();
  const today = zonedNow(useNow()).date;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<MessageKey | null>(null);
  const d = (iso: string) => formatIsoDate(iso, lang);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const x = absenceError(from, to, today);
    setErr(x);
    if (x) return;
    if (await run(() => addAbsence(from, to, reason), t('scAbsAdded'))) {
      setFrom('');
      setTo('');
      setReason('');
    }
  }

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('scAbsences')}</h2>
      <p className="muted small">{t('scAbsNote')}</p>
      {data.absences.length === 0 ? <p className="muted">{t('scAbsNone')}</p> : (
        <ul className="record-list">
          {data.absences.map((a) => (
            <li key={a.id} className="record-row">
              <div className="record-main">
                <span className="record-title">{a.from === a.to ? d(a.from) : t('scAbsRange', { a: d(a.from), b: d(a.to) })}</span>
                {a.reason && <span className="muted small">{a.reason}</span>}
              </div>
              {data.can_edit && (
                <div className="row-actions">
                  <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => removeAbsence(a.id), t('scAbsRemoved'))}>{t('pnRemove')}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.can_edit && (
        <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
          <h3 className="h-sub">{t('scAbsAdd')}</h3>
          <div className="row-2">
            <Field id={`${uid}-from`} label={t('scAbsFrom')} error={err === 'scErrAbsFrom' ? { key: err } : undefined} required>
              {(a) => <input {...a} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
            </Field>
            <Field id={`${uid}-to`} label={t('scAbsTo')} error={err && err !== 'scErrAbsFrom' ? { key: err } : undefined} hint={t('scAbsToHint')} optional>
              {(a) => <input {...a} type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} />}
            </Field>
          </div>
          <Field id={`${uid}-reason`} label={t('rcReason')} hint={t('scAbsReasonHint')} optional>
            {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
          <button type="submit" className="btn btn-secondary btn-start" disabled={busy}>{t('scAbsAddBtn')}</button>
        </form>
      )}
    </section>
  );
}

function WindowCard({ data, busy, run }: CardProps) {
  const { t } = useI18n();
  const uid = useId();
  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('scWindow')}</h2>
      <Field id={`${uid}-w`} label={t('scWindowLabel')} hint={t('scWindowHint')}>
        {(a) => (
          <select {...a} value={data.weeks_ahead} disabled={!data.can_edit || busy} onChange={(e) => void run(() => setBookingWindow(Number(e.target.value)), t('scWindowSaved'))}>
            {WEEKS_AHEAD.map((w) => <option key={w} value={w}>{t('scWeeks', { n: w })}</option>)}
          </select>
        )}
      </Field>
    </section>
  );
}
