import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, formatIsoDate, type MessageKey } from '../i18n';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { useNow } from '../lib/useNow';
import { zonedNow } from '../lib/time';
import { practicePatients, type PatientRow } from '../lib/practiceAccess';
import { practiceSchedule, type AppointmentType } from '../lib/practiceSchedule';
import {
  CANCEL_LABEL, CANCEL_REASONS, CLOSED_LABEL, FILTERS, FILTER_LABEL, STATUS_LABEL, STATUS_TONE, bookAppointment, bookErrors, bookingErrorKey, byDay,
  cancelAppointment, checkSlot, confirmAppointment, counts, dayOf, emptyBook, endOf, filterAppointments, freeSlots, hasWarnings, isOpen, markAppointment, moveAppointment,
  practiceAppointments, timeOf, toInstant, whenErrors, type BookForm, type CancelReason, type Filter, type PracticeAppointment, type Warnings,
} from '../lib/practiceAppointments';
import { usePractice } from './PracticeProvider';

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;

/** Termine der Praxis: Liste mit Filtern, telefonisch eintragen, verschieben, absagen, erschienen / nicht erschienen. */
export function PracticeAppointments() {
  const { t, lang } = useI18n();
  const { me } = usePractice();
  const pending = me?.practice?.status === 'pending';
  const now = useNow();
  const [rows, setRows] = useState<PracticeAppointment[] | null>(null);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [filter, setFilter] = useState<Filter>('confirmed');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [booking, setBooking] = useState(false);
  const [moving, setMoving] = useState<PracticeAppointment | null>(null);
  const [cancelling, setCancelling] = useState<PracticeAppointment | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, s] = await Promise.all([practiceAppointments(), practiceSchedule()]);
      setRows(a);
      setTypes(s.types);
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
      setMsg({ ok: false, text: t(bookingErrorKey(e)) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [load, t]);

  const c = useMemo(() => (rows ? counts(rows, now) : null), [rows, now]);
  const shown = useMemo(() => (rows ? byDay(filterAppointments(rows, filter, now)) : []), [rows, filter, now]);

  return (
    <div className="page stack-lg">
      <div className="page-head page-head-row patients-head">
        <h1>{t('scTitle')}</h1>
        {!pending && (
          <div className="row-actions">
            <button type="button" className="btn btn-primary" disabled={!rows || types.length === 0} onClick={() => setBooking(true)}>{t('bkBook')}</button>
            <Link to="/praxis/termine/einstellungen" className="btn btn-secondary">{t('bkSettings')}</Link>
          </div>
        )}
      </div>
      {pending ? (
        <div className="notice notice-warn" role="status">
          <p><strong>{t('pp_pendingTitle')}</strong></p>
          <p>{t('scPending')}</p>
        </div>
      ) : loadErr && !rows ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !rows || !c ? <p className="muted">{t('loading')}</p> : (
        <>
          <div className="record-status" role="status" aria-live="polite">
            {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}
          </div>
          {c.new > 0 && filter !== 'new' && (
            <p className="notice notice-info">
              {t('obNewHint', { n: c.new })}{' '}
              <button type="button" className="link-btn" onClick={() => setFilter('new')}>{t('bkShow')}</button>
            </p>
          )}
          {c.open > 0 && filter !== 'open' && (
            <p className="notice notice-warn">
              {t('bkOpenHint', { n: c.open })}{' '}
              <button type="button" className="link-btn" onClick={() => setFilter('open')}>{t('bkShow')}</button>
            </p>
          )}
          <div className="chips-wrap" role="group" aria-label={t('bkFilterL')}>
            {FILTERS.filter((f) => f !== 'new' || c.new > 0).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {t(FILTER_LABEL[f])} ({c[f]})
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="muted">{t(filter === 'confirmed' ? 'bkNoneUpcoming' : 'bkNone')}</p> : shown.map(({ day, items }) => (
            <section key={day} className="stack" aria-labelledby={`bk-${day}`}>
              <h2 id={`bk-${day}`} className="h-sub">{formatDate(new Date(`${day}T12:00:00Z`), lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
              <ul className="record-list card">
                {items.map((a) => <Row key={a.id} a={a} now={now} busy={busy} run={run} onMove={setMoving} onCancel={setCancelling} />)}
              </ul>
            </section>
          ))}
          <p className="muted small">{t('bkOwnerNote')}</p>
        </>
      )}
      {booking && <BookDialog types={types} onClose={() => setBooking(false)} onDone={async (text) => { setBooking(false); await load(); setMsg({ ok: true, text }); }} />}
      {moving && <MoveDialog a={moving} onClose={() => setMoving(null)} onDone={async (text) => { setMoving(null); await load(); setMsg({ ok: true, text }); }} />}
      {cancelling && <CancelDialog a={cancelling} busy={busy} onClose={() => setCancelling(null)}
        onCancel={(reason, note) => run(() => cancelAppointment(cancelling.id, reason, note), t(cancelling.status === 'new' ? 'obDeclined' : 'bkCancelled', { n: cancelling.pet_label }))} />}
    </div>
  );
}

function Row({ a, now, busy, run, onMove, onCancel }: {
  a: PracticeAppointment; now: Date; busy: boolean; run: Run; onMove: (a: PracticeAppointment) => void; onCancel: (a: PracticeAppointment) => void;
}) {
  const { t } = useI18n();
  const open = isOpen(a, now);
  const future = (a.status === 'confirmed' || a.status === 'new') && new Date(a.starts_at) > now;
  const closed = a.status === 'cancelled_practice' || a.status === 'cancelled_owner';
  return (
    <li className={`record-row${closed ? ' is-closed' : ''}`}>
      <span className="appt-time mono">{timeOf(a.starts_at)}<span className="muted small">–{timeOf(endOf(a))}</span></span>
      <div className="record-main">
        <span className="record-title">
          {a.pet_label} <span className="muted">· {a.owner_label}</span>
          <span className={`pill ${open ? 'pill-warn' : STATUS_TONE[a.status]}`}>{t(open ? 'bkStOpen' : STATUS_LABEL[a.status])}</span>
          {a.new_client && <span className="pill pill-accent">{t('bkNewClient')}</span>}
        </span>
        <span className="small">{a.type_name} · {t(a.source === 'online' ? 'bkSrcOnline' : 'bkSrcPhone')}</span>
        {a.phone && <span className="small"><a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`}>{a.phone}</a></span>}
        {a.note && <span className="small pre-line">{a.note}</span>}
        {closed && a.cancel_reason && <span className="small">{t('rcReason')}: {t(CANCEL_LABEL[a.cancel_reason])}{a.cancel_note ? ` – ${a.cancel_note}` : ''}</span>}
        {a.overridden && !closed && <span className="small owner-note">{t('bkOverridden')}</span>}
        {a.source !== 'online' && <span className="muted small">{t('bkBy', { n: a.created_by_name })}</span>}
      </div>
      <div className="row-actions">
        {a.has_access && a.pet_id && <Link to={`/praxis/patienten/${a.pet_id}`} className="btn btn-ghost">{t('ptRecord')}</Link>}
        {a.status === 'new' && (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} aria-label={t('obConfirmL', { n: a.pet_label })}
              onClick={() => void run(() => confirmAppointment(a.id), t('obConfirmed', { n: a.pet_label }))}>{t('obConfirm')}</button>
            <button type="button" className="btn btn-ghost" disabled={busy} aria-label={t('obDeclineL', { n: a.pet_label })} onClick={() => onCancel(a)}>{t('obDecline')}</button>
          </>
        )}
        {future && (
          <>
            <button type="button" className="btn btn-ghost" disabled={busy} aria-label={t('bkMoveL', { n: a.pet_label })} onClick={() => onMove(a)}>{t('bkMove')}</button>
            {a.status !== 'new' && <button type="button" className="btn btn-ghost" disabled={busy} aria-label={t('bkCancelL', { n: a.pet_label })} onClick={() => onCancel(a)}>{t('apCancel')}</button>}
          </>
        )}
        {open && (
          <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run(() => markAppointment(a.id, true), t('bkMarked'))}>{t('bkAttended')}</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => markAppointment(a.id, false), t('bkMarked'))}>{t('bkNoShow')}</button>
          </>
        )}
        {(a.status === 'attended' || a.status === 'no_show') && (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => markAppointment(a.id, a.status === 'no_show'), t('bkMarked'))}>
            {t(a.status === 'no_show' ? 'bkFixAttended' : 'bkFixNoShow')}
          </button>
        )}
      </div>
    </li>
  );
}

/** Freie Zeiten eines Tages als Knöpfe */
function SlotPicker({ minutes, day, exclude, value, onPick }: { minutes: number | null; day: string; exclude?: string; value: string; onPick: (hhmm: string) => void }) {
  const { t } = useI18n();
  const [slots, setSlots] = useState<{ key: string; list: string[] } | null>(null);
  const key = `${minutes}|${day}|${exclude ?? ''}`;
  useEffect(() => {
    if (!minutes || !day) return;
    let alive = true;
    freeSlots(minutes, day, 1, 60, exclude)
      .then((list) => { if (alive) setSlots({ key, list }); })
      .catch(() => { if (alive) setSlots({ key, list: [] }); });
    return () => { alive = false; };
  }, [minutes, day, exclude, key]);
  if (!minutes || !day) return null;
  const list = slots?.key === key ? slots.list : null;
  return (
    <div className="stack slot-picker">
      <span className="label-text">{t('bkFree')}</span>
      {list === null ? <span className="muted small">{t('loading')}</span> : list.length === 0 ? <span className="muted small">{t('bkNoFree')}</span> : (
        <div className="chips-wrap" role="group" aria-label={t('bkFree')}>
          {list.map((iso) => {
            const hm = timeOf(iso);
            return <button key={iso} type="button" className="chip" aria-pressed={value === hm} onClick={() => onPick(hm)}>{hm}</button>;
          })}
        </div>
      )}
    </div>
  );
}

/** Warnung vor dem Speichern: Praxis geschlossen, Pause, Abwesenheit oder Überschneidung */
function WarningBox({ w, busy, onForce, onBack }: { w: Warnings; busy: boolean; onForce: () => void; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div className="notice notice-warn stack" role="alert">
      {w.closed && <p>{t(CLOSED_LABEL[w.closed])}{w.closed === 'absence' && w.absence ? ` (${w.absence})` : ''}</p>}
      {w.overlaps.map((o, i) => <p key={i}>{t('bkWOverlap', { n: `${o.pet} (${o.owner})`, t: timeOf(o.starts_at) })}</p>)}
      <div className="row-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onForce}>{t('bkForce')}</button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>{t('bkOtherTime')}</button>
      </div>
    </div>
  );
}

function useNowParts() {
  const z = zonedNow(useNow());
  return { today: z.date, nowHHMM: `${String(Math.floor(z.minutes / 60)).padStart(2, '0')}:${String(z.minutes % 60).padStart(2, '0')}` };
}

function BookDialog({ types, onClose, onDone }: { types: AppointmentType[]; onClose: () => void; onDone: (text: string) => Promise<void> }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { today, nowHHMM } = useNowParts();
  const [v, setV] = useState<BookForm>(() => emptyBook(today, types[0]?.id ?? ''));
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof BookForm, MessageKey>>>({});
  const [warn, setWarn] = useState<Warnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<MessageKey | null>(null);
  const set = <K extends keyof BookForm>(k: K, x: BookForm[K]) => { setV((c) => ({ ...c, [k]: x })); setWarn(null); };
  const type = types.find((x) => x.id === v.typeId) ?? null;

  useEffect(() => {
    practicePatients().then((p) => setPatients([...p].sort((a, b) => a.name.localeCompare(b.name, lang)))).catch(() => setPatients([]));
  }, [lang]);

  async function save(force: boolean) {
    const errs = bookErrors(v, today, nowHHMM);
    setErrors(errs);
    setFail(null);
    if (Object.keys(errs).length || !type) return;
    setBusy(true);
    try {
      if (!force) {
        const w = await checkSlot(toInstant(v.day, v.time), type.minutes);
        if (hasWarnings(w)) {
          setWarn(w);
          return;
        }
      }
      await bookAppointment(v, force);
      const name = v.mode === 'patient' ? (patients?.find((p) => p.pet_id === v.petId)?.name ?? '') : v.petName.trim();
      await onDone(t('bkBooked', { n: name, d: formatIsoDate(v.day, lang), t: v.time }));
    } catch (e) {
      setFail(bookingErrorKey(e));
    } finally {
      setBusy(false);
    }
  }

  const err = (k: keyof BookForm) => (errors[k] ? { key: errors[k] } : undefined);
  return (
    <Dialog open title={t('bkBook')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        <button type="submit" form={`${uid}-f`} className="btn btn-primary" disabled={busy || !!warn}>{t('bkSave')}</button>
      </>
    }>
      <form id={`${uid}-f`} className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void save(false); }} noValidate>
        <fieldset className="field">
          <legend>{t('bkWho')}</legend>
          <div className="chips-wrap">
            <button type="button" className="chip" aria-pressed={v.mode === 'patient'} onClick={() => set('mode', 'patient')}>{t('bkModePatient')}</button>
            <button type="button" className="chip" aria-pressed={v.mode === 'free'} onClick={() => set('mode', 'free')}>{t('bkModeFree')}</button>
          </div>
        </fieldset>
        {v.mode === 'patient' ? (
          <Field id={`${uid}-pet`} label={t('bkPatient')} error={err('petId')} hint={patients?.length === 0 ? t('bkNoPatients') : undefined} required>
            {(a) => (
              <select {...a} value={v.petId} onChange={(e) => set('petId', e.target.value)}>
                <option value="">{t('rcReasonPick')}</option>
                {(patients ?? []).filter((p) => !p.deceased).map((p) => <option key={p.pet_id} value={p.pet_id}>{[p.name, p.owner_name].filter(Boolean).join(' · ')}</option>)}
              </select>
            )}
          </Field>
        ) : (
          <>
            <div className="row-2">
              <Field id={`${uid}-pn`} label={t('petName')} error={err('petName')} required>
                {(a) => <input {...a} type="text" maxLength={60} autoComplete="off" value={v.petName} onChange={(e) => set('petName', e.target.value)} />}
              </Field>
              <Field id={`${uid}-on`} label={t('bkOwnerName')} error={err('ownerName')} required>
                {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={v.ownerName} onChange={(e) => set('ownerName', e.target.value)} />}
              </Field>
            </div>
            <Field id={`${uid}-ph`} label={t('pf_phone')} optional>
              {(a) => <input {...a} type="tel" maxLength={40} autoComplete="off" value={v.phone} onChange={(e) => set('phone', e.target.value)} />}
            </Field>
          </>
        )}
        <Field id={`${uid}-type`} label={t('bkType')} error={err('typeId')} required>
          {(a) => (
            <select {...a} value={v.typeId} onChange={(e) => set('typeId', e.target.value)}>
              {types.map((x) => <option key={x.id} value={x.id}>{x.name} ({t('scMinutes', { n: x.minutes })})</option>)}
            </select>
          )}
        </Field>
        <div className="row-2">
          <Field id={`${uid}-day`} label={t('wkDate')} error={err('day')} required>
            {(a) => <input {...a} type="date" min={today} value={v.day} onChange={(e) => set('day', e.target.value)} />}
          </Field>
          <Field id={`${uid}-time`} label={t('bkTime')} error={err('time')} required>
            {(a) => <input {...a} type="time" step={300} value={v.time} onChange={(e) => set('time', e.target.value)} />}
          </Field>
        </div>
        <SlotPicker minutes={type?.minutes ?? null} day={v.day} value={v.time} onPick={(hm) => set('time', hm)} />
        <label className="check-row">
          <input type="checkbox" checked={v.newClient} onChange={(e) => set('newClient', e.target.checked)} />
          <span>{t('bkNewClientCheck')}</span>
        </label>
        <Field id={`${uid}-note`} label={t('rcNote')} optional>
          {(a) => <input {...a} type="text" maxLength={300} autoComplete="off" value={v.note} onChange={(e) => set('note', e.target.value)} />}
        </Field>
        {warn && <WarningBox w={warn} busy={busy} onForce={() => void save(true)} onBack={() => setWarn(null)} />}
        {fail && <p className="notice notice-crit" role="alert">{t(fail)}</p>}
      </form>
    </Dialog>
  );
}

function MoveDialog({ a, onClose, onDone }: { a: PracticeAppointment; onClose: () => void; onDone: (text: string) => Promise<void> }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const { today, nowHHMM } = useNowParts();
  const [day, setDay] = useState(dayOf(a.starts_at));
  const [time, setTime] = useState('');
  const [suggest, setSuggest] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<{ day?: MessageKey; time?: MessageKey }>({});
  const [warn, setWarn] = useState<Warnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<MessageKey | null>(null);

  useEffect(() => {
    freeSlots(a.minutes, today, 21, 3, a.id).then(setSuggest).catch(() => setSuggest([]));
  }, [a.minutes, a.id, today]);

  async function save(d: string, hm: string, force: boolean) {
    const errs = whenErrors(d, hm, today, nowHHMM);
    setErrors(errs);
    setFail(null);
    if (errs.day || errs.time) return;
    setBusy(true);
    try {
      const iso = toInstant(d, hm);
      if (!force) {
        const w = await checkSlot(iso, a.minutes, a.id);
        if (hasWarnings(w)) {
          setDay(d);
          setTime(hm);
          setWarn(w);
          return;
        }
      }
      await moveAppointment(a.id, iso, force);
      await onDone(t('bkMoved', { n: a.pet_label, d: formatIsoDate(d, lang), t: hm }));
    } catch (e) {
      setFail(bookingErrorKey(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open title={t('bkMoveTitle')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        <button type="submit" form={`${uid}-f`} className="btn btn-primary" disabled={busy || !!warn}>{t('bkMove')}</button>
      </>
    }>
      <form id={`${uid}-f`} className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void save(day, time, false); }} noValidate>
        <p><strong>{a.pet_label}</strong> · {a.owner_label}<br />
          <span className="muted small">{a.type_name} · {t('bkNow', { d: formatIsoDate(dayOf(a.starts_at), lang), t: timeOf(a.starts_at) })}</span></p>
        <div className="stack">
          <span className="label-text">{t('bkSuggest')}</span>
          {suggest === null ? <span className="muted small">{t('loading')}</span> : suggest.length === 0 ? <span className="muted small">{t('bkNoFree')}</span> : (
            <div className="row-actions">
              {suggest.map((iso) => (
                <button key={iso} type="button" className="btn btn-secondary" disabled={busy} onClick={() => void save(dayOf(iso), timeOf(iso), false)}>
                  {formatDate(new Date(iso), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, {timeOf(iso)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="row-2">
          <Field id={`${uid}-day`} label={t('wkDate')} error={errors.day ? { key: errors.day } : undefined} required>
            {(x) => <input {...x} type="date" min={today} value={day} onChange={(e) => { setDay(e.target.value); setWarn(null); }} />}
          </Field>
          <Field id={`${uid}-time`} label={t('bkTime')} error={errors.time ? { key: errors.time } : undefined} required>
            {(x) => <input {...x} type="time" step={300} value={time} onChange={(e) => { setTime(e.target.value); setWarn(null); }} />}
          </Field>
        </div>
        <SlotPicker minutes={a.minutes} day={day} exclude={a.id} value={time} onPick={(hm) => { setTime(hm); setWarn(null); }} />
        {warn && <WarningBox w={warn} busy={busy} onForce={() => void save(day, time, true)} onBack={() => setWarn(null)} />}
        {fail && <p className="notice notice-crit" role="alert">{t(fail)}</p>}
      </form>
    </Dialog>
  );
}

function CancelDialog({ a, busy, onClose, onCancel }: { a: PracticeAppointment; busy: boolean; onClose: () => void; onCancel: (reason: CancelReason, note: string) => Promise<boolean> }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [reason, setReason] = useState<CancelReason | ''>('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<MessageKey | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason) return setErr('rcErrReason');
    if (reason === 'other' && !note.trim()) return setErr('rcErrNote');
    setErr(null);
    if (await onCancel(reason, note)) onClose();
  }

  return (
    <Dialog open title={t(a.status === 'new' ? 'obDeclineTitle' : 'bkCancelTitle')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('back')}</button>
        <button type="submit" form={`${uid}-f`} className="btn btn-danger" disabled={busy}>{t(a.status === 'new' ? 'obDecline' : 'bkCancelBtn')}</button>
      </>
    }>
      <form id={`${uid}-f`} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <p><strong>{a.pet_label}</strong> · {a.owner_label}<br />
          <span className="muted small">{a.type_name} · {formatIsoDate(dayOf(a.starts_at), lang)}, {timeOf(a.starts_at)}</span></p>
        <Field id={`${uid}-r`} label={t('bkCancelReason')} error={err === 'rcErrReason' ? { key: err } : undefined} required>
          {(x) => (
            <select {...x} value={reason} onChange={(e) => setReason(e.target.value as CancelReason | '')}>
              <option value="">{t('rcReasonPick')}</option>
              {CANCEL_REASONS.map((r) => <option key={r} value={r}>{t(CANCEL_LABEL[r])}</option>)}
            </select>
          )}
        </Field>
        <Field id={`${uid}-n`} label={t('bkCancelNote')} error={err === 'rcErrNote' ? { key: err } : undefined} required={reason === 'other'} optional={reason !== 'other'}>
          {(x) => <textarea {...x} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <p className="muted small">{t(a.has_access || a.source === 'online' ? 'bkCancelInfoApp' : 'bkCancelInfoPhone')}</p>
      </form>
    </Dialog>
  );
}
