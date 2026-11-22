import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
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
  practiceInquiries, replyInquiry, sendPracticeMessage, sortInquiries, type PracticeInquiry,
} from '../lib/inquiries';
import { usePractice } from './PracticeProvider';
import { practicePatients, type PatientRow } from '../lib/practiceAccess';
import { useDeepLink } from '../components/useDeepLink';

type Run = (fn: () => Promise<unknown>, ok: string) => Promise<boolean>;
type Tab = 'open' | 'done';

/** Anfragen der Halter:innen, sortiert nach Dringlichkeit: antworten, Termin anbieten, erledigt. */
export function PracticeInquiries() {
  const { t } = useI18n();
  const { me } = usePractice();
  const pending = me?.practice?.status === 'pending';
  const [rows, setRows] = useState<PracticeInquiry[] | null>(null);
  // ?anfrage=<ID> aus einer Benachrichtigung
  const deep = useDeepLink('anfrage', rows ? rows.map((q) => q.id) : null);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [tab, setTab] = useState<Tab>('open');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [offering, setOffering] = useState<PracticeInquiry | null>(null);
  // Nachricht schreiben (Auftrag 13); ?schreiben=<Tier-ID> aus der Patientenakte wählt den Patienten vor
  const [params] = useSearchParams();
  const [writing, setWriting] = useState<string | null>(() => params.get('schreiben'));

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
      <div className="page-head page-head-row">
        <div>
          <h1>{t('iqTitle')}</h1>
          <p className="muted">{t('iqSub')}</p>
        </div>
        {!pending && <button type="button" className="btn btn-primary" onClick={() => setWriting('')}>{t('msgWrite')}</button>}
      </div>
      {deep.missing && <p className="notice notice-warn" role="alert">{t('ncGone')}</p>}
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
      {writing !== null && !pending && <WriteDialog petId={writing} busy={busy} run={run} onClose={() => setWriting(null)} />}
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

  if (q.origin === 'practice') {
    return (
      <li id={`dl-${q.id}`} className={`iq-item is-msg${done ? ' is-done' : ''}`}>
        <div className="iq-head">
          <span className="record-title">
            {t('msgTo', { o: q.owner_label })} <span className="muted">· {q.has_access ? <Link to={`/praxis/patienten/${q.pet_id}`} className="link">{q.pet_label}</Link> : q.pet_label}</span>
          </span>
          <span className="small muted">{when(q.created_at)}</span>
        </div>
        <div className="cal-tags">
          <span className="pill pill-brand">{t('ncCatMsg')}</span>
          <span className={`pill ${q.owner_reply && !done ? 'pill-warn' : ''}`}>{t(done ? 'iqStDone' : q.owner_reply ? 'msgReplyIn' : 'msgWaiting')}</span>
        </div>
        <p className="iq-msg">{q.message}</p>
        {q.sent_by_name && <p className="small muted">{t('msgSentBy', { n: q.sent_by_name })}</p>}
        {q.owner_reply && (
          <div className="iq-reply">
            <p className="small muted">{t('msgOwnerReply', { o: q.owner_label, d: q.owner_replied_at ? when(q.owner_replied_at) : '' })}</p>
            <p>{q.owner_reply}</p>
          </div>
        )}
        {!done && (
          <div className="row-actions">
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => closeInquiry(q.id), t('iqClosed'))}>{t('iqDone')}</button>
          </div>
        )}
      </li>
    );
  }
  return (
    <li id={`dl-${q.id}`} className={`iq-item is-${done ? 'done' : q.urgency}`}>
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

/** Nachricht an die Halter:innen eines Patienten mit Freigabe (Auftrag 13) */
function WriteDialog({ petId, busy, run, onClose }: { petId: string; busy: boolean; run: Run; onClose: () => void }) {
  const { t } = useI18n();
  const uid = useId();
  const [patients, setPatients] = useState<PatientRow[] | null>(null);
  const [pet, setPet] = useState(petId);
  const [text, setText] = useState('');
  const [err, setErr] = useState<{ pet?: MessageKey; text?: MessageKey }>({});
  useEffect(() => {
    let alive = true;
    practicePatients()
      .then((p) => { if (alive) setPatients(p.filter((x) => !x.deceased)); })
      .catch(() => { if (alive) setPatients([]); });
    return () => { alive = false; };
  }, []);
  const send = async () => {
    const v = text.trim();
    const e: { pet?: MessageKey; text?: MessageKey } = {};
    if (!pet) e.pet = 'msgErrPet';
    if (!v) e.text = 'iqErrMessage';
    else if (v.length > MESSAGE_MAX) e.text = 'obErrLong';
    setErr(e);
    if (e.pet || e.text) return;
    if (await run(() => sendPracticeMessage(pet, v), t('msgSent'))) onClose();
  };
  return (
    <Dialog open title={t('msgWrite')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
        <button type="button" className="btn btn-primary" disabled={busy || !patients} onClick={() => void send()}>{t('msgSend')}</button>
      </>
    }>
      {!patients ? <p className="muted">{t('loading')}</p> : (
        <div className="stack">
          <Field id={`${uid}-p`} label={t('msgPatient')} error={err.pet ? { key: err.pet } : undefined} required>
            {(a) => (
              <select {...a} value={pet} onChange={(e) => setPet(e.target.value)}>
                <option value="">{t('msgChoose')}</option>
                {patients.map((p) => <option key={p.pet_id} value={p.pet_id}>{p.name}{p.owner_name ? ` · ${p.owner_name}` : ''}</option>)}
              </select>
            )}
          </Field>
          <Field id={`${uid}-t`} label={t('msgText')} hint={t('msgHint')} error={err.text ? { key: err.text } : undefined} required>
            {(a) => <textarea {...a} rows={5} maxLength={MESSAGE_MAX} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <p className="small muted">{t('msgPrivacy')}</p>
        </div>
      )}
    </Dialog>
  );
}
