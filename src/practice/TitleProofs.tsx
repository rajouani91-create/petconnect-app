import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { Field } from '../components/Field';
import { TITLE_TEXT, type PracticeTitle } from '../lib/practiceCatalog';
import {
  PROOF_TYPES, errorCode, practiceErrorKey, practiceProofs, proofFileError, proofState, removeProof, uploadProof, type ProofRow, type ProofState,
} from '../lib/practiceAccount';
import type { MessageKey } from '../i18n';

const STATE_TEXT: Record<ProofState, MessageKey> = { reading: 'pvReading', review: 'pvReview', approved: 'pvApproved', rejected: 'pvRejected' };

/** Nachweise für Fachtitel: Urkunde hochladen (Praxisleitung), Stand je Titel sehen. Die Urkunde wird nach der Entscheidung gelöscht. */
export function TitleProofs({ practiceId, titles, verified, isLead, onChanged }: {
  practiceId: string;
  titles: PracticeTitle[];
  verified: PracticeTitle[];
  isLead: boolean;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [open, setOpen] = useState<PracticeTitle | null>(null);
  const [person, setPerson] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errs, setErrs] = useState<{ person?: MessageKey; file?: MessageKey }>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!isLead) return;
    try {
      setProofs(await practiceProofs());
    } catch {
      setProofs([]);
    }
  }, [isLead]);
  useEffect(() => {
    void load();
  }, [load]);

  if (titles.length === 0) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!open) return;
    const fe = file ? proofFileError(file) : 'file_type';
    const next = { person: person.trim().length < 2 ? ('err_required' as const) : undefined, file: file ? (fe ? practiceErrorKey(fe) : undefined) : ('err_required' as const) };
    setErrs(next);
    if (next.person || next.file || !file) return;
    setBusy(true);
    setMsg(null);
    try {
      await uploadProof(practiceId, open, person, file);
      setOpen(null);
      setPerson('');
      setFile(null);
      setMsg({ ok: true, text: t('pvUploaded') });
      await load();
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: t(practiceErrorKey(errorCode(err) ?? (err instanceof Error ? err.message : null))) });
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(id: string) {
    setBusy(true);
    try {
      await removeProof(id);
      await load();
    } catch {
      setMsg({ ok: false, text: t('pe_generic') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack proofs">
      <h3>{t('pvTitle')}</h3>
      <p className="muted small">{t('pvIntro')}</p>
      {msg && <p className={`notice ${msg.ok ? 'notice-ok' : 'notice-crit'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <ul className="member-list">
        {titles.map((ti) => {
          const isVerified = verified.includes(ti);
          const pending = proofs.find((p) => p.title === ti && p.decision === null);
          const last = proofs.find((p) => p.title === ti);
          return (
            <li key={ti} className="member-row team-row">
              <div className="member-text">
                <span className="member-name">{t(TITLE_TEXT[ti])}</span>
                <span className="small">
                  <span className={`pill ${isVerified ? 'pill-ok' : pending ? 'pill-warn' : ''}`}>
                    {isVerified ? t('psVerified') : pending ? t(STATE_TEXT[proofState(pending)]) : t('psSelfReported')}
                  </span>
                  {!isVerified && !pending && last?.decision === 'rejected' && (
                    <span className="muted"> {t('pvRejectedWhy', { x: last.decision_reason ?? '–' })}</span>
                  )}
                </span>
              </div>
              {isLead && (
                <div className="row-actions">
                  {pending ? (
                    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void onRemove(pending.id)}>{t('pvRemove')}</button>
                  ) : !isVerified && open !== ti ? (
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setOpen(ti); setErrs({}); setMsg(null); }}>{t('pvUpload')}</button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {isLead && open && (
        <form className="stack card proof-form" onSubmit={submit} noValidate>
          <h4>{t('pvFormTitle', { x: t(TITLE_TEXT[open]) })}</h4>
          <Field id="pv-person" label={t('pvPerson')} hint={t('pvPersonHint')} error={errs.person ? { key: errs.person } : undefined} required>
            {(a) => <input {...a} type="text" maxLength={80} autoComplete="off" value={person} onChange={(e) => { setPerson(e.target.value); setErrs((p) => ({ ...p, person: undefined })); }} />}
          </Field>
          <Field id="pv-file" label={t('pvFile')} hint={t('pvFileHint')} error={errs.file ? { key: errs.file } : undefined} required>
            {(a) => (
              <input {...a} ref={fileRef} className="file-input" type="file" accept={Object.keys(PROOF_TYPES).join(',')}
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrs((p) => ({ ...p, file: undefined })); }} />
            )}
          </Field>
          <p className="notice notice-info small">{t('pvPrivacy')}</p>
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('pvSend')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(null)}>{t('pp_cancel')}</button>
          </div>
        </form>
      )}
    </div>
  );
}
