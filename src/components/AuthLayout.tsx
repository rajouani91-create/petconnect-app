import { useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { LANGUAGES, isLang } from '../i18n';
import { readPendingInvite } from '../lib/sharing';
import { LogoMark } from './Icons';

/** Rahmen für Anmelden/Registrieren: Marke, Sprachwahl, Karte. `inviteHint`: Hinweis, falls eine Einladung wartet. */
export function AuthLayout({ title, sub, children, inviteHint = false }: { title: string; sub?: string; children: ReactNode; inviteHint?: boolean }) {
  const { t, lang, setLang } = useI18n();
  const [hasInvite] = useState(() => inviteHint && readPendingInvite() !== null);
  return (
    <div className="auth">
      <header className="auth-top">
        <span className="brand">
          <LogoMark />
          <span>PetConnect</span>
        </span>
        <label className="lang-select">
          <span className="sr-only">{t('langLabel')}</span>
          <select value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <main id="main" className="auth-main">
        <div className="card auth-card">
          <h1>{title}</h1>
          {sub && <p className="muted auth-sub">{sub}</p>}
          {hasInvite && <p className="notice notice-info" role="status">{t('invLoginHint')}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
