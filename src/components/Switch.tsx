interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Sichtbare Beschriftung */
  label: string;
  /** Optional abweichender Name für Screenreader */
  ariaLabel?: string;
  /** Beschriftung nur für Screenreader */
  hideLabel?: boolean;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, ariaLabel, hideLabel, disabled, id }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className={hideLabel ? 'sr-only' : 'switch-label'}>{label}</span>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}
