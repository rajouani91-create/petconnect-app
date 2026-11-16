import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate, type MessageKey } from '../../i18n';
import { Field } from '../../components/Field';
import { IconBack, IconPhone } from '../../components/Icons';
import { Loading } from '../../components/Loading';
import {
  MESSAGE_MAX, STATUS_LABEL, STATUS_TONE, TOPICS, TOPIC_LABEL, URGENCIES, URGENCY_LABEL, URGENCY_TONE, closeOwnerInquiry, emptyInquiry,
  inquiryErrorKey, inquiryErrors, inquiryTargets, ownerInquiries, sendInquiry, takeInquirySlot, targetKey,
  type InquiryForm, type InquiryTarget, type OwnerInquiry,
} from '../../lib/inquiries';

/** Mehr → Anfragen an die Praxis: Frage, Rezept oder Beschwerden; Antworten und Terminvorschläge der Praxis. */
export function Inquiries() {
  const { t } = useI18n();
  const [targets, setTargets] = useState<InquiryTarget[] | null>(null);
  const [rows, setRows] = useState<OwnerInquiry[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([inquiryTargets(), ownerInquiries()]);
      setTargets(a);
      setRows(b);
      setLoadErr(false);
    } catch (e) {
      console.error(e);
      setLoadErr(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (fn: () => Promise<unknown>, ok: string) => {
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

  return (
    <div className="page stack-lg">
      <Link to="/mehr" className="back-link"><IconBack size={20} />{t('moreTitle')}</Link>
      <header className="page-head">
        <h1>{t('iqOwnerTitle')}</h1>
        <p className="muted">{t('iqOwnerSub')}</p>
      </header>
      {loadErr && !rows ? <p className="notice notice-crit" role="alert">{t('errGeneric')}</p> : !rows || !targets ? <Loading /> : (
        <>
          <div role="status" aria-live="polite">
            {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`}>{msg.text}</p>}
          </div>
          {targets.length === 0 ? (
            <div className="card stack">
              <p>{t('iqNoTargets')}</p>
              <div className="row-actions"><Link to="/praxen" className="btn btn-secondary">{t('iqToPractices')}</Link></div>
            </div>
          ) : <NewInquiry targets={targets} busy={busy} run={run} />}
          <section className="stack" aria-labelledby="iq-mine">
            <h2 id="iq-mine">{t('iqMine')}</h2>
            {rows.length === 0 ? <p className="muted">{t('iqMineNone')}</p> : (
              <ul className="stack">
                {rows.map((q) => <Item key={q.id} q={q} busy={busy} run={run} />)}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function NewInquiry({ targets, busy, run }: { targets: InquiryTarget[]; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<InquiryForm>(() => emptyInquiry(targets.length === 1 ? targetKey(targets[0]!) : ''));
  const [errors, setErrors] = useState<Partial<Record<keyof InquiryForm, MessageKey>>>({});
  const set = <K extends keyof InquiryForm>(k: K, val: InquiryForm[K]) => { setV((o) => ({ ...o, [k]: val })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const target = targets.find((x) => targetKey(x) === v.target);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const er = inquiryErrors(v);
    setErrors(er);
    if (Object.keys(er).length) return;
    if (await run(() => sendInquiry(v), t('iqSentOk', { p: target?.practice_name ?? '' }))) setV(emptyInquiry(v.target));
  };
  const err = (k: keyof InquiryForm) => (errors[k] ? { key: errors[k]! } : undefined);

  return (
    <section className="card stack" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`}>{t('iqNew')}</h2>
      <form className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <Field id={`${uid}-to`} label={t('iqTo')} error={err('target')} required>
          {(a) => (
            <select {...a} value={v.target} onChange={(e) => set('target', e.target.value)}>
              <option value="">{t('rcReasonPick')}</option>
              {targets.map((x) => <option key={targetKey(x)} value={targetKey(x)}>{x.pet_name} · {x.practice_name}</option>)}
            </select>
          )}
        </Field>
        <fieldset className={`field${errors.topic ? ' has-error' : ''}`}>
          <legend>{t('iqTopic')} <span className="req" aria-hidden="true">*</span></legend>
          <div className="chips-wrap">
            {TOPICS.map((x) => <button key={x} type="button" className="chip" aria-pressed={v.topic === x} onClick={() => set('topic', x)}>{t(TOPIC_LABEL[x])}</button>)}
          </div>
          {errors.topic && <p className="error" role="alert">{t(errors.topic)}</p>}
        </fieldset>
        <fieldset className="field">
          <legend>{t('iqUrgency')}</legend>
          <div className="chips-wrap">
            {URGENCIES.map((x) => <button key={x} type="button" className="chip" aria-pressed={v.urgency === x} onClick={() => set('urgency', x)}>{t(URGENCY_LABEL[x])}</button>)}
          </div>
        </fieldset>
        {v.urgency === 'emergency' && (
          <div className="notice notice-crit" role="note">
            <p><strong>{t('iqEmergencyCall')}</strong></p>
            {target?.practice_phone ? (
              <p><a className="btn btn-primary" href={`tel:${target.practice_phone.replace(/[^\d+]/g, '')}`}><IconPhone size={20} />{t('iqCall', { p: target.practice_name })}</a></p>
            ) : <p className="small">{t('iqEmergencyNoPhone')}</p>}
          </div>
        )}
        <Field id={`${uid}-msg`} label={t('iqMessage')} error={err('message')} hint={t('iqMessageHint', { n: MESSAGE_MAX })} required>
          {(a) => <textarea {...a} rows={4} maxLength={MESSAGE_MAX} value={v.message} onChange={(e) => set('message', e.target.value)} />}
        </Field>
        <p className="small muted">{t('iqPrivacy')}</p>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{t('iqSend')}</button>
        </div>
      </form>
    </section>
  );
}

function Item({ q, busy, run }: { q: OwnerInquiry; busy: boolean; run: (fn: () => Promise<unknown>, ok: string) => Promise<boolean> }) {
  const { t, lang } = useI18n();
  const when = (iso: string) => formatDate(new Date(iso), lang, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  const done = q.status === 'done';
  return (
    <li className={`iq-item is-${done ? 'done' : q.urgency}`}>
      <div className="iq-head">
        <span className="record-title">{q.pet_name} <span className="muted">· {q.practice_name}</span></span>
        <span className="small muted">{when(q.created_at)}</span>
      </div>
      <div className="cal-tags">
        <span className={`pill ${URGENCY_TONE[q.urgency]}`}>{t(URGENCY_LABEL[q.urgency])}</span>
        <span className="pill">{t(TOPIC_LABEL[q.topic])}</span>
        <span className={`pill ${STATUS_TONE[q.status]}`}>{t(STATUS_LABEL[q.status])}</span>
      </div>
      <p className="iq-msg">{q.message}</p>
      {q.reply ? (
        <div className="iq-reply">
          <p className="small muted">{t('iqReplyFrom', { p: q.practice_name, d: q.replied_at ? when(q.replied_at) : '' })}</p>
          <p>{q.reply}</p>
        </div>
      ) : !done && <p className="small muted">{t('iqWaiting')}</p>}
      {q.offered_slots && q.offered_slots.length > 0 && (
        <div className="stack">
          <p className="small"><strong>{t('iqOfferedOwner', { type: q.offered_type_name ?? '' })}</strong></p>
          <div className="iq-slots">
            {q.offered_slots.map((iso) => (
              <button key={iso} type="button" className="btn btn-secondary" disabled={busy || !q.can_edit}
                onClick={() => void run(() => takeInquirySlot(q.id, iso), t('iqTaken', { d: when(iso) }))}>
                {when(iso)}
              </button>
            ))}
          </div>
          <p className="small muted">{t('iqTakeHint')}</p>
        </div>
      )}
      {!done && q.can_edit && (
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void run(() => closeOwnerInquiry(q.id), t('iqClosedOwner'))}>{t('iqCloseOwner')}</button>
        </div>
      )}
    </li>
  );
}
