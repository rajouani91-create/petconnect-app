import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { formatDate, type MessageKey } from '../i18n';
import { Dialog } from '../components/Dialog';
import { Field } from '../components/Field';
import { useNow } from '../lib/useNow';
import { zonedNow } from '../lib/time';
import { practiceSchedule, type AppointmentType } from '../lib/practiceSchedule';
import { freeSlots, timeOf } from '../lib/practiceAppointments';
import {
  MAX_OFFER, MESSAGE_MAX, STATUS_LABEL, STATUS_TONE, TOPIC_LABEL, URGENCY_LABEL, URGENCY_TONE, closeInquiry, inquiryErrorKey, offerInquiry,
  practiceInquiries, replyInquiry, sortInquiries, type PracticeInquiry,
} from '../lib/inquiries';
import { usePractice } from './PracticeProvider';

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;
type Tab = 'open' | 'done';

/** Anfragen der Halter:innen, sortiert nach Dringlichkeit: antworten, Termin anbieten, erledigt. */
export function PracticeInquiries() {
  const { t } = useI18n();
  const { me } = usePractice();
  const pending = me?.practice?.status === 'pending';
  const [rows, setRows] = useState<PracticeInquiry[] | null>(null);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [tab, setTab] = useState<Tab>('open');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [offering, setOffering] = useState<PracticeInquiry | null>(null);

  const load = useCallback(async () => {
    try {
      const [q, s] = await Promise.all([practiceInquiries(), practiceSchedule().catch(() => null)]);
      setRows(sortInquiries(q));
      if (s) setTypes(s.types);
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
      setMsg({ ok: false, text: t(inquiryErrorKey(e)) });
      return false;
    } finally {
      setBusy(false);
    }
  }, [load, t]);

  const openRows = useMemo(() => (rows ?? []).filter((r) => r.status !== 'done'), [rows]);
  const doneRows = useMemo(() => (rows ?? []).filter((r) => r.status === 'done'), [rows]);
  const emergencies = openRows.filter((r) => r.urgency === 'emergency' && r.status === 'open').length;
  const shown = tab === 'open' ? openRows : doneRows;

  return (
    <div className="page stack-lg">
      <div className="page-head">
        <h1>{t('iqTitle')}</h1>
        <p className="muted">{t('iqSub')}</p>
      </div>
      {pending ? (
        <div className="notice notice-warn" role="status">
          <p><strong>{t('pp_pendingTitle')}</strong></p>
          <p>{t('scPending')}</p>
        </div>
      ) : loadErr && !rows ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !rows ? <p className="muted">{t('loading')}</p> : (
        <>
          <div className="record-status" role="status" aria-live="polite">
            {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}
          </div>
          {emergencies > 0 && <p className="notice notice-crit">{t('iqEmergencyHint', { n: emergencies })}</p>}
          <div className="chips-wrap" role="group" aria-label={t('bkFilterL')}>
            <button type="button" className="chip" aria-pressed={tab === 'open'} onClick={() => setTab('open')}>{t('iqTabOpen')} ({openRows.length})</button>
            <button type="button" className="chip" aria-pressed={tab === 'done'} onClick={() => setTab('done')}>{t('iqTabDone')} ({doneRows.length})</button>
          </div>
          {shown.length === 0 ? <div className="card"><p className="muted">{t(tab === 'open' ? 'iqNone' : 'iqNoneDone')}</p></div> : (
            <ul className="stack" aria-label={t('iqTitle')}>
              {shown.map((q) => <Item key={q.id} q={q} busy={busy} run={run} canOffer={types.length > 0} onOffer={() => setOffering(q)} />)}
            </ul>
          )}
          <p className="small muted note-line">{t('iqPracticeNote')}</p>
        </>
      )}
      {offering && <OfferDialog q={offering} types={types} busy={busy} run={run} onClose={() => setOffering(null)} />}
    </div>
  );
}

function Item({ q, busy, run, canOffer, onOffer }: { q: PracticeInquiry; busy: boolean; run: Run; canOffer: boolean; onOffer: () => void }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<MessageKey | null>(null);
  const done = q.status === 'done';
  const when = (iso: string) => formatDate(new Date(iso), lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    if (!v) { setErr('iqErrMessage'); return; }
    setErr(null);
    if (await run(() => replyInquiry(q.id, v), t('iqReplied'))) { setReplying(false); setText(''); }
  };

  return (
    <li className={`iq-item is-${done ? 'done' : q.urgency}`}>
      <div className="iq-head">
        <span className="record-title">
          {q.has_access ? <Link to={`/praxis/patienten/${q.pet_id}`} className="link">{q.pet_label}</Link> : q.pet_label}
          <span className="muted"> · {q.owner_label}</span>
        </span>
        <span className="small muted">{when(q.created_at)}</span>
      </div>
      <div className="cal-tags">
        <span className={`pill ${URGENCY_TONE[q.urgency]}`}>{t(URGENCY_LABEL[q.urgency])}</span>
        <span className="pill">{t(TOPIC_LABEL[q.topic])}</span>
        <span className={`pill ${STATUS_TONE[q.status]}`}>{t(STATUS_LABEL[q.status])}</span>
      </div>
      <p className="iq-msg">{q.message}</p>
      {q.reply && (
        <div className="iq-reply">
          <p className="small muted">{t('iqReplyBy', { name: q.replied_by_name ?? '–', d: q.replied_at ? when(q.replied_at) : '' })}</p>
          <p>{q.reply}</p>
        </div>
      )}
      {q.offered_slots && q.offered_slots.length > 0 && !done && (
        <p className="small">{t('iqOffered', { type: q.offered_type_name ?? '', list: q.offered_slots.map(when).join(', ') })}</p>
      )}
      {q.booked_appointment_id && <p className="small notice notice-ok">{t('iqBooked')}</p>}
      {!q.has_access && !done && <p className="small muted">{t('iqNoAccess')}</p>}
      {replying && (
        <form className="stack" onSubmit={(e) => void send(e)} noValidate>
          <Field id={`${uid}-r`} label={t('iqReplyLabel')} error={err ? { key: err } : undefined} hint={t('iqReplyHint')}>
            {(a) => <textarea {...a} rows={3} maxLength={MESSAGE_MAX} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{t('iqSendReply')}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setReplying(false); setErr(null); }}>{t('cancelBtn')}</button>
          </div>
        </form>
      )}
      {!done && !replying && (
        <div className="row-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReplying(true)}>{t(q.reply ? 'iqReplyAgain' : 'iqReply')}</button>
          <button type="button" className="btn btn-secondary" disabled={busy || !q.has_access || !canOffer} onClick={onOffer}>{t('iqOffer')}</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => closeInquiry(q.id), t('iqClosed'))}>{t('iqDone')}</button>
        </div>
      )}
    </li>
  );
}

/** Bis zu drei freie Zeiten (gleiche Terminart) vorschlagen; die Halter:in übernimmt eine davon. */
function OfferDialog({ q, types, busy, run, onClose }: { q: PracticeInquiry; types: AppointmentType[]; busy: boolean; run: Run; onClose: () => void }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const now = useNow();
  const today = zonedNow(now).date;
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [day, setDay] = useState(today);
  const [picked, setPicked] = useState<string[]>([]);
  const [slots, setSlots] = useState<{ key: string; list: string[] } | null>(null);
  const [err, setErr] = useState<MessageKey | null>(null);
  const minutes = types.find((x) => x.id === typeId)?.minutes ?? null;
  const key = `${minutes}|${day}`;
  useEffect(() => {
    if (!minutes || !day) return;
    let alive = true;
    freeSlots(minutes, day, 1, 60)
      .then((list) => { if (alive) setSlots({ key, list: list.filter((iso) => new Date(iso).getTime() > Date.now() + 3600000) }); })
      .catch(() => { if (alive) setSlots({ key, list: [] }); });
    return () => { alive = false; };
  }, [minutes, day, key]);
  const list = slots?.key === key ? slots.list : null;
  const toggle = (iso: string) => setPicked((p) => (p.includes(iso) ? p.filter((x) => x !== iso) : p.length >= MAX_OFFER ? p : [...p, iso].sort()));
  const label = (iso: string) => formatDate(new Date(iso), lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (picked.length === 0) { setErr('iqErrSlots'); return; }
    if (await run(() => offerInquiry(q.id, typeId, picked), t('iqOfferSent', { n: picked.length }))) onClose();
  };

  return (
    <Dialog open title={t('iqOfferTitle', { pet: q.pet_label })} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('close')}</button>
        <button type="submit" form={`${uid}-f`} className="btn btn-primary" disabled={busy}>{t('iqOfferSend', { n: picked.length })}</button>
      </>
    }>
      <form id={`${uid}-f`} className="stack" onSubmit={(e) => void save(e)} noValidate>
        <p className="small muted">{t('iqOfferHint')}</p>
        <Field id={`${uid}-type`} label={t('bkType')} required>
          {(a) => (
            <select {...a} value={typeId} onChange={(e) => { setTypeId(e.target.value); setPicked([]); }}>
              {types.map((x) => <option key={x.id} value={x.id}>{x.name} ({t('scMinutes', { n: x.minutes })})</option>)}
            </select>
          )}
        </Field>
        <Field id={`${uid}-day`} label={t('wkDate')} required>
          {(a) => <input {...a} type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} />}
        </Field>
        <div className="stack slot-picker">
          <span className="label-text">{t('bkFree')}</span>
          {list === null ? <span className="muted small">{t('loading')}</span> : list.length === 0 ? <span className="muted small">{t('bkNoFree')}</span> : (
            <div className="chips-wrap" role="group" aria-label={t('bkFree')}>
              {list.map((iso) => (
                <button key={iso} type="button" className="chip" aria-pressed={picked.includes(iso)} disabled={!picked.includes(iso) && picked.length >= MAX_OFFER} onClick={() => { toggle(iso); setErr(null); }}>{timeOf(iso)}</button>
              ))}
            </div>
          )}
        </div>
        {picked.length > 0 && (
          <div className="stack">
            <span className="label-text">{t('iqPicked', { n: picked.length, max: MAX_OFFER })}</span>
            <div className="iq-slots">
              {picked.map((iso) => (
                <button key={iso} type="button" className="chip" aria-pressed="true" onClick={() => toggle(iso)} aria-label={t('iqRemoveSlot', { d: label(iso) })}>
                  {label(iso)} ✕
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <p className="error" role="alert">{t(err)}</p>}
      </form>
    </Dialog>
  );
}
