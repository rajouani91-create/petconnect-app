import { useEffect, useId, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDate, type MessageKey } from '../../i18n';
import { NOTE_MAX, bookingOwnerErrorKey, cancelBooking } from '../../lib/booking';
import { OWNER_CANCEL_LABEL, OWNER_CANCEL_REASONS, timeOf, type OwnerCancelReason } from '../../lib/practiceAppointments';
import { Dialog } from '../Dialog';

interface Props {
  appt: { id: string; title: string; starts_at: string; petName: string } | null;
  /** Verschieben statt absagen anbieten */
  canMove: boolean;
  onClose: () => void;
  onMove: () => void;
  onDone: (msg: string) => void;
}

/** Praxistermin absagen (Release C): Grund und Notiz freiwillig, „lieber verschieben“ als Ausweg. */
export function CancelSheet({ appt, canMove, onClose, onMove, onDone }: Props) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [reason, setReason] = useState<OwnerCancelReason | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const id = appt?.id;

  useEffect(() => {
    setReason(null);
    setNote('');
    setErr(null);
  }, [id]);

  async function submit() {
    if (!appt) return;
    if (note.trim().length > NOTE_MAX) { setErr('obErrLong'); return; }
    setBusy(true);
    setErr(null);
    try {
      await cancelBooking(appt.id, reason, note);
      onDone(t('obCancelled', { x: appt.title }));
    } catch (e) {
      console.error(e);
      setErr(bookingOwnerErrorKey(e));
    } finally {
      setBusy(false);
    }
  }

  const when = appt ? `${formatDate(new Date(appt.starts_at), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, ${timeOf(appt.starts_at)}` : '';

  return (
    <Dialog open={appt !== null} sheet title={t('obCancelTitle')} onClose={onClose}
      actions={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('obKeep')}</button>
          <button type="button" className="btn btn-danger" disabled={busy} aria-busy={busy} onClick={() => void submit()}>{t('obCancelBtn')}</button>
        </>
      )}>
      {appt && (
        <div className="stack">
          <p className="muted small">{[when, appt.petName, appt.title].filter(Boolean).join(' · ')}</p>
          <fieldset className="field">
            <legend>{t('obCancelReason')} <span className="muted small">({t('optional')})</span></legend>
            <div className="chips-wrap">
              {OWNER_CANCEL_REASONS.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason((c) => (c === r ? null : r))}>
                  {t(OWNER_CANCEL_LABEL[r])}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field" htmlFor={`${uid}-note`}>
            <span className="label-text">{t('obMoveNote')} <span className="muted small">({t('optional')})</span></span>
            <textarea id={`${uid}-note`} rows={3} maxLength={NOTE_MAX} value={note} placeholder={t('obCancelNotePh')} onChange={(e) => setNote(e.target.value)} />
          </label>
          {canMove && <button type="button" className="link-btn" onClick={onMove}>{t('obRatherMove')}</button>}
          {err && <p className="notice notice-crit" role="alert">{t(err)}</p>}
        </div>
      )}
    </Dialog>
  );
}
