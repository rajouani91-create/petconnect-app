import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { ImprintBody, PrivacyBody } from './legalContent';
import { LogoMark } from '../components/Icons';

// Rechtstexte nur auf Deutsch (Hinweis in anderen Sprachen). Angaben aus src/lib/legal.ts.
// RECHTLICH PRÜFEN: Beide Seiten vor der Einreichung im Play Store prüfen lassen.

/** Öffentlicher Rahmen (ohne Anmeldung): Marke, Zurück-Link, Hinweis „nur auf Deutsch“ */
function LegalFrame({ title, children }: { title: string; children: ReactNode }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  return (
    <div className="public-page">
      <header className="auth-top">
        <Link to={user ? '/mehr' : '/login'} className="brand">
          <LogoMark />
          <span>PetConnect24</span>
        </Link>
      </header>
      <main id="main" className="public-main">
        <article className="card stack legal-page" lang="de">
          <h1>{title}</h1>
          {lang !== 'de' && <p className="notice notice-info" lang={lang}>{t('legalNote')}</p>}
          {children}
        </article>
        <p className="auth-foot">
          <Link to="/impressum" className="link">{t('legalImprint')}</Link>
          <Link to="/datenschutz" className="link">{t('legalPrivacy')}</Link>
          <Link to={user ? '/' : '/login'} className="link">{t(user ? 'legalBackApp' : 'legalBackLogin')}</Link>
        </p>
      </main>
    </div>
  );
}

export function Imprint() {
  return (
    <LegalFrame title="Impressum">
      <ImprintBody />
    </LegalFrame>
  );
}

export function Privacy() {
  return (
    <LegalFrame title="Datenschutzerklärung">
      <PrivacyBody />
    </LegalFrame>
  );
}
