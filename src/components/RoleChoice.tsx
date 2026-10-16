import { useI18n } from '../i18n/I18nProvider';
import { GRANT_ROLES, ROLE_HINT, ROLE_LABEL, type GrantRole } from '../lib/sharing';

/** Auswahl der Rechte-Stufe (Mithalter:in / Nur ansehen) mit Erklärung. */
export function RoleChoice({ name, value, onChange, legend }: { name: string; value: GrantRole; onChange: (r: GrantRole) => void; legend: string }) {
  const { t } = useI18n();
  return (
    <fieldset className="field role-choice">
      <legend>{legend}</legend>
      <div className="role-options">
        {GRANT_ROLES.map((r) => (
          <label key={r} className="radio role-option">
            <input type="radio" name={name} value={r} checked={value === r} onChange={() => onChange(r)} aria-describedby={`${name}-${r}-x`} />
            <span className="role-text">
              <span className="role-title">{t(ROLE_LABEL[r])}</span>
              <span className="muted small" id={`${name}-${r}-x`}>{t(ROLE_HINT[r])}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
