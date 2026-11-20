import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';

interface SidePanelProps {
  open: boolean;
  title: string;
  /** Zeile unter dem Titel (z. B. Tier und Allergie) */
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** Leiste rechts (auf dem Handy ganzer Bildschirm) auf Basis von <dialog>: Fokusfalle, Escape und Hintergrund-Sperre vom Browser. */
export function SidePanel({ open, title, sub, onClose, children }: SidePanelProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnFocus.current = document.activeElement;
      d.showModal();
      d.querySelector<HTMLElement>('.sidepanel-body')?.scrollTo({ top: 0 });
    } else if (!open && d.open) {
      d.close();
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sidepanel"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sidepanel-inner">
          <div className="sidepanel-head">
            <div className="stack-sm">
              <h2 id={titleId}>{title}</h2>
              {sub && <div className="muted small">{sub}</div>}
            </div>
            <button type="button" className="btn btn-ghost sidepanel-close" aria-label={t('close')} onClick={onClose}>×</button>
          </div>
          <div className="sidepanel-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
