// Gemeinsame Bausteine der Patientenakte: Felder je Eintragsart, Grund-Auswahl, Dialoge für Korrektur, Storno und Verlauf.
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDate, localeOf, type MessageKey } from '../../i18n';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { formatKg } from '../../lib/record';
import {
  NOTE_MAX, REASONS, REASON_LABEL, entryData, entryErrors, entryLog, reasonError, recordErrorKey,
  type EntryKind, type FormValues, type LogRow, type PatientRecord, type Reason,
} from '../../lib/practiceRecord';

/** Was jede Karte der Akte braucht */
export interface RecordCtx {
  rec: PatientRecord;
  petId: string;
  today: string;
  busy: boolean;
  /** Führt eine Aktion aus, meldet Erfolg oder Fehler und lädt die Akte neu. true = hat geklappt */
  run: (fn: () => Promise<unknown>, okText: string) => Promise<boolean>;
  openEdit: (e: EditTarget) => void;
  openVoid: (v: VoidTarget) => void;
  openLog: (l: LogTarget) => void;
}
export interface EditTarget { kind: EntryKind; entryId: string; title: string; values: FormValues }
export interface VoidTarget { entryId: string; title: string; confirmed?: boolean }
export interface LogTarget { entryId: string | null; title: string }

export const KIND_LABEL: Record<EntryKind, MessageKey> = { vaccination: 'hsKindVacc', finding: 'hsKindDoc', medication: 'hsKindMed', weight: 'hsKindWeight' };

/** „Erfasst am {d} von {n}“ plus Kennzeichen „geändert“ (öffnet den Verlauf) */
export function EnteredBy({ at, by, changed, onLog }: { at: string | null; by: string | null; changed: boolean; onLog?: (() => void) | undefined }) {
  const { t, lang } = useI18n();
  if (!at) return null;
  return (
    <span className="muted small">
      {by ? t('rcEnteredBy', { d: formatIsoDate(at.slice(0, 10), lang), n: by }) : t('rcEnteredOn', { d: formatIsoDate(at.slice(0, 10), lang) })}
      {changed && onLog && (
        <>
          {' · '}
          <button type="button" className="link-btn" onClick={onLog}>✎ {t('rcChanged')}</button>
        </>
      )}
    </span>
  );
}

// ---------- Felder je Eintragsart ----------

const TEXT = { maxLength: 120 } as const;

export function EntryFields({ kind, v, set, errors, uid }: { kind: EntryKind; v: FormValues; set: (k: string, x: string) => void; errors: Record<string, MessageKey>; uid: string }) {
  const { t } = useI18n();
  const err = (k: string) => (errors[k] ? { key: errors[k] } : undefined);
  const text = (k: string, label: MessageKey, opts: { required?: boolean; optional?: boolean; hint?: MessageKey; max?: number; type?: string } = {}) => (
    <Field id={`${uid}-${k}`} label={t(label)} error={err(k)} hint={opts.hint ? t(opts.hint) : undefined} required={opts.required ?? false} optional={opts.optional ?? false}>
      {(a) => <input {...a} type={opts.type ?? 'text'} maxLength={opts.max ?? TEXT.maxLength} autoComplete="off" value={v[k] ?? ''} onChange={(e) => set(k, e.target.value)} />}
    </Field>
  );
  if (kind === 'vaccination') {
    return (
      <>
        {text('name', 'rcVaccine', { required: true, max: 80 })}
        {text('given_on', 'vcGivenOn', { required: true, type: 'date' })}
        {text('valid_until', 'vcValidUntil', { optional: true, type: 'date' })}
      </>
    );
  }
  if (kind === 'finding') {
    return (
      <>
        {text('date', 'wkDate', { required: true, type: 'date' })}
        {text('title', 'rcFTitle', { required: true })}
        <Field id={`${uid}-text`} label={t('rcFText')} optional>
          {(a) => <textarea {...a} rows={4} maxLength={4000} value={v.text ?? ''} onChange={(e) => set('text', e.target.value)} />}
        </Field>
      </>
    );
  }
  if (kind === 'medication') {
    return (
      <>
        {text('name', 'rcFMed', { required: true, max: 80 })}
        {text('dosage', 'rcFDosage', { required: true, hint: 'rcFDosageHint' })}
        {text('reason', 'rcFReason', { optional: true, max: 200 })}
        {text('starts_on', 'rcFStart', { required: true, type: 'date' })}
        {text('ends_on', 'rcFEnd', { optional: true, type: 'date', hint: 'rcFEndHint' })}
      </>
    );
  }
  return (
    <>
      <Field id={`${uid}-kg`} label={t('wkKg')} error={err('kg')} required>
        {(a) => <input {...a} type="text" inputMode="decimal" autoComplete="off" maxLength={8} value={v.kg ?? ''} onChange={(e) => set('kg', e.target.value)} />}
      </Field>
      {text('measured_on', 'wkDate', { required: true, type: 'date' })}
    </>
  );
}

// ---------- Grund ----------

export function ReasonFields({ reason, note, setReason, setNote, error, uid }: { reason: Reason | ''; note: string; setReason: (r: Reason | '') => void; setNote: (n: string) => void; error: MessageKey | null; uid: string }) {
  const { t } = useI18n();
  return (
    <>
      <Field id={`${uid}-reason`} label={t('rcReason')} error={error === 'rcErrReason' ? { key: error } : undefined} required>
        {(a) => (
          <select {...a} value={reason} onChange={(e) => setReason(e.target.value as Reason | '')}>
            <option value="">{t('rcReasonPick')}</option>
            {REASONS.map((r) => <option key={r} value={r}>{t(REASON_LABEL[r])}</option>)}
          </select>
        )}
      </Field>
      <Field id={`${uid}-note`} label={t('rcNote')} error={error === 'rcErrNote' ? { key: error } : undefined} required={reason === 'other'} optional={reason !== 'other'}>
        {(a) => <input {...a} type="text" maxLength={NOTE_MAX} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </>
  );
}

function useReason() {
  const [reason, setReason] = useState<Reason | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const check = (): Reason | null => {
    const e = reasonError(reason, note);
    setError(e);
    return e || !reason ? null : reason;
  };
  return { reason, note, setReason, setNote, error, check };
}

// ---------- Eintrag korrigieren ----------

export function EditDialog({ target, today, busy, onClose, onSave }: {
  target: EditTarget; today: string; busy: boolean; onClose: () => void;
  onSave: (data: Record<string, string | number | null>, reason: Reason, note: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const uid = useId();
  const [v, setV] = useState<FormValues>(target.values);
  const [errors, setErrors] = useState<Record<string, MessageKey>>({});
  const r = useReason();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = entryErrors(target.kind, v, today);
    setErrors(errs);
    const reason = r.check();
    if (Object.keys(errs).length || !reason) return;
    if (await onSave(entryData(target.kind, v), reason, r.note)) onClose();
  }

  return (
    <Dialog open title={t('rcEditTitle')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
        <button type="submit" form={`${uid}-form`} className="btn btn-primary" disabled={busy}>{t('rcSaveCorrection')}</button>
      </>
    }>
      <form id={`${uid}-form`} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <p className="muted small">{target.title}</p>
        <EntryFields kind={target.kind} v={v} set={(k, x) => setV((c) => ({ ...c, [k]: x }))} errors={errors} uid={uid} />
        <ReasonFields {...r} uid={uid} />
        <p className="muted small">{t('rcNeverDeleted')}</p>
      </form>
    </Dialog>
  );
}

// ---------- Eintrag stornieren ----------

export function VoidDialog({ target, busy, onClose, onVoid }: { target: VoidTarget; busy: boolean; onClose: () => void; onVoid: (reason: Reason, note: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const uid = useId();
  const r = useReason();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const reason = r.check();
    if (!reason) return;
    if (await onVoid(reason, r.note)) onClose();
  }

  return (
    <Dialog open title={t(target.confirmed ? 'rcUnconfirmTitle' : 'rcVoidTitle')} onClose={onClose} actions={
      <>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
        <button type="submit" form={`${uid}-form`} className="btn btn-danger" disabled={busy}>{t(target.confirmed ? 'rcUnconfirm' : 'rcVoid')}</button>
      </>
    }>
      <form id={`${uid}-form`} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <p><strong>{target.title}</strong></p>
        <p>{t(target.confirmed ? 'rcUnconfirmText' : 'rcVoidText')}</p>
        <ReasonFields {...r} uid={uid} />
      </form>
    </Dialog>
  );
}

// ---------- Verlauf ----------

const FIELD_LABEL: Record<string, MessageKey> = {
  name: 'pp_name', given_on: 'vcGivenOn', valid_until: 'vcValidUntil', date: 'wkDate', title: 'rcFTitle', text: 'rcFText', dosage: 'rcFDosage', reason: 'rcFReason',
  starts_on: 'rcFStart', ends_on: 'rcFEnd', stopped_on: 'rcFStopped', kg: 'wkKg', measured_on: 'wkDate', breed: 'breed', sex: 'sex', birth_date: 'birth', chip_no: 'chip', allergies: 'allergies',
};
const ACTION_LABEL: Record<LogRow['action'], MessageKey> = { create: 'rcActCreate', confirm: 'rcActConfirm', correct: 'rcActCorrect', end: 'rcActEnd', void: 'rcActVoid', restore: 'rcActRestore' };
const DATE_KEYS = new Set(['given_on', 'valid_until', 'date', 'starts_on', 'ends_on', 'stopped_on', 'measured_on', 'birth_date']);

export function LogDialog({ petId, target, onClose }: { petId: string; target: LogTarget; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [failed, setFailed] = useState<MessageKey | null>(null);

  useEffect(() => {
    let alive = true;
    entryLog(petId, target.entryId)
      .then((r) => { if (alive) setRows(r); })
      .catch((e: unknown) => { if (alive) setFailed(recordErrorKey(e)); });
    return () => { alive = false; };
  }, [petId, target.entryId]);

  const show = (k: string, x: string | number | null | undefined) => {
    if (x === null || x === undefined || x === '') return '–';
    if (DATE_KEYS.has(k)) return formatIsoDate(String(x), lang);
    if (k === 'kg') return t('wkKgValue', { kg: formatKg(Number(x), localeOf(lang)) });
    if (k === 'sex') return x === 'female' ? t('sexF') : x === 'male' ? t('sexM') : String(x);
    return String(x);
  };

  return (
    <Dialog open title={t('rcLogTitle')} onClose={onClose} actions={<button type="button" className="btn btn-primary" onClick={onClose}>{t('close')}</button>}>
      <p className="muted small">{target.title}</p>
      {failed ? <p className="notice notice-crit" role="alert">{t(failed)}</p> : !rows ? <p className="muted">{t('loading')}</p> : rows.length === 0 ? <p className="muted">{t('rcLogEmpty')}</p> : (
        <ol className="record-log">
          {rows.map((r, i) => {
            const keys = r.action === 'correct' || r.action === 'end' ? Object.keys({ ...r.before, ...r.after }).filter((k) => (r.before?.[k] ?? null) !== (r.after?.[k] ?? null)) : [];
            return (
              <li key={i}>
                <strong>{t(ACTION_LABEL[r.action])}</strong>
                <span className="muted small"> · {new Date(r.created_at).toLocaleString(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short' })} · {r.actor_name}</span>
                {r.reason && <div className="small">{t('rcReason')}: {t(REASON_LABEL[r.reason])}{r.note ? ` – ${r.note}` : ''}</div>}
                {keys.length > 0 && (
                  <ul className="record-diff small">
                    {keys.map((k) => (
                      <li key={k}>
                        {FIELD_LABEL[k] ? t(FIELD_LABEL[k]) : k}: <s>{show(k, r.before?.[k])}</s> → {show(k, r.after?.[k])}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Dialog>
  );
}
