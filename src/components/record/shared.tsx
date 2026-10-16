// Gemeinsame Bausteine der Tierakte: Status-Zeile, Löschdialog, „eingetragen von“, Fokus nach dem Speichern.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { Dialog } from '../Dialog';

export type Status = { text: string; ok: boolean };

/** Sichtbare Statusmeldung (role="status"), leer unsichtbar */
export function StatusLine({ status }: { status: Status }) {
  return (
    <p className={status.text ? `notice ${status.ok ? 'notice-ok' : 'notice-crit'}` : 'sr-only'} role="status" aria-live="polite">
      {status.text}
    </p>
  );
}

export function useStatus() {
  const [status, setState] = useState<Status>({ text: '', ok: true });
  const set = useCallback((text: string, ok = true) => setState({ text, ok }), []);
  return [status, set] as const;
}

/** Lösch-Rückfrage im Dialog; der Lösch-Knopf ist rot, Abbrechen zuerst (Escape schließt). */
export function ConfirmDelete({
  open,
  title,
  children,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>{t('gpDelYes')}</button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/**
 * Fokus nach dem Speichern: Ziel per Schlüssel merken, nach dem nächsten Rendern dorthin.
 * `register(key)` an das Element hängen, `focusLater(key)` aufrufen.
 */
export function useFocusAfter() {
  const els = useRef(new Map<string, HTMLElement>());
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    els.current.get(target)?.focus();
    setTarget(null);
  }, [target]);
  const register = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) els.current.set(key, el);
      else els.current.delete(key);
    },
    [],
  );
  return { register, focusLater: setTarget };
}

/** „eingetragen von Kyra“ – nur bei anderen Personen mit lesbarem Namen */
export function ByLine({ ownerId, myId, names }: { ownerId: string; myId: string | undefined; names: ReadonlyMap<string, string> }) {
  const { t } = useI18n();
  if (ownerId === myId) return null;
  const name = names.get(ownerId)?.trim();
  if (!name) return null;
  return <span className="muted small">{t('recBy', { n: name })}</span>;
}
