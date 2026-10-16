import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Schaltflächen am Ende */
  actions: ReactNode;
}

/** Modaler Dialog auf Basis von <dialog>: Fokusfalle, Escape und Hintergrund-Sperre vom Browser. */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnFocus.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-body">
        <h2 id={titleId}>{title}</h2>
        <div className="dialog-content">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </dialog>
  );
}
