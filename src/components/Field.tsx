import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import type { FieldError } from '../lib/validate';

export interface ControlProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
  'aria-required'?: boolean;
}

interface FieldProps {
  id: string;
  label: string;
  error?: FieldError | undefined;
  hint?: string | undefined;
  required?: boolean;
  optional?: boolean;
  /** Bekommt die ARIA-Attribute, die auf das Eingabeelement gehören. */
  children: (control: ControlProps) => ReactNode;
}

/** Beschriftung, Hinweis und Fehlermeldung direkt am Feld (aria-invalid + aria-describedby). */
export function Field({ id, label, error, hint, required, optional, children }: FieldProps) {
  const { t } = useI18n();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
        {optional && <span className="opt"> ({t('optional')})</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, ...(required ? { 'aria-required': true } : {}) })}
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error" id={errId}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="7" fill="currentColor" />
            <path d="M8 4.5v4M8 11h.01" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {t(error.key, error.vars)}
        </p>
      )}
    </div>
  );
}
