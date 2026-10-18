import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { FACTS, LEGAL } from '../lib/legal';
import { LogoMark } from '../components/Icons';

/** Platzhalter, solange Ahmed die Angabe noch nicht eingetragen hat */
function Todo({ children }: { children: string }) {
  return <mark className="legal-todo">[BITTE ERGÄNZEN: {children}]</mark>;
}
const val = (v: string | null, todo: string) => (v ? <span className="pre">{v}</span> : <Todo>{todo}</Todo>);

/** Öffentlicher Rahmen (ohne Anmeldung): Marke, Zurück-Link, Hinweis „nur auf Deutsch“ */
function LegalFrame({ title, children }: { title: string; children: ReactNode }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  return (
    <div className="public-page">
      <header className="auth-top">
        <Link to={user ? '/mehr' : '/login'} className="brand">
          <LogoMark />
          <span>PetConnect</span>
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
      <h2>Angaben zum Anbieter</h2>
      <p>{val(LEGAL.name, 'Name der verantwortlichen Person oder Firma')}</p>
      <p>{val(LEGAL.address, 'Anschrift (Straße, Hausnummer, PLZ, Ort)')}</p>
      <h2>Kontakt</h2>
      <p>E-Mail: {val(LEGAL.email, 'E-Mail-Adresse')}</p>
      <p>Telefon: {val(LEGAL.phone, 'Telefon (falls angegeben)')}</p>
      <h2>Weitere Angaben</h2>
      <p><Todo>ggf. Rechtsform, Registergericht und -nummer, Umsatzsteuer-ID, inhaltlich verantwortliche Person</Todo></p>
      <h2>Kartendaten</h2>
      <p>{FACTS.maps}</p>
    </LegalFrame>
  );
}

export function Privacy() {
  return (
    <LegalFrame title="Datenschutz">
      <p><Todo>Diese Seite vor der Veröffentlichung vollständig ausfüllen und rechtlich prüfen lassen.</Todo></p>
      <h2>Verantwortliche Stelle</h2>
      <p>{val(LEGAL.name, 'Name')}</p>
      <p>{val(LEGAL.address, 'Anschrift')}</p>
      <p>E-Mail: {val(LEGAL.email, 'E-Mail-Adresse für Datenschutzanfragen')}</p>

      <h2>Welche Daten PetConnect verarbeitet</h2>
      <p>Konto (E-Mail-Adresse, Anzeigename, Sprache) und die Angaben, die Sie zu Ihren Tieren eintragen – zum Beispiel Tierakte, Medikamente, Termine, Erinnerungen, Notfallkarte, Fotos und Dokumente.</p>
      <p><Todo>Zwecke und Rechtsgrundlagen der Verarbeitung</Todo></p>

      <h2>Wo die Daten liegen</h2>
      <ul>
        <li>Hosting: {FACTS.hosting}</li>
        <li>Datenbank und Anmeldung: {FACTS.database}</li>
      </ul>
      <p><Todo>Angaben zu Auftragsverarbeitung und ggf. Übermittlung in Drittländer</Todo></p>

      <h2>Push-Benachrichtigungen</h2>
      <p>Nur wenn Sie sie auf einem Gerät aktivieren. Übertragen über den {FACTS.push}. Die Benachrichtigungen enthalten Tiername, Medikament oder Termin und Uhrzeit; sie werden verschlüsselt übertragen. Sie können sie jederzeit unter „Mehr → Benachrichtigungen“ ausschalten.</p>

      <h2>Standort und Praxissuche</h2>
      <p>Ihr Standort wird nur nach Ihrem Klick auf „Mein Standort“ für die jeweilige Suche verwendet und nicht gespeichert. Praxisdaten: {FACTS.maps}.</p>

      <h2>Werbung und Tracking</h2>
      <p>PetConnect zeigt keine Werbung und verwendet kein Tracking.</p>

      <h2>Konto löschen</h2>
      <p>Sie können die Löschung Ihres Kontos jederzeit anfragen – in der App unter „Mehr → Konto → Konto löschen“ oder per E-Mail an {val(LEGAL.email, 'E-Mail-Adresse')}.</p>

      <h2>Ihre Rechte</h2>
      <p><Todo>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Beschwerderecht bei der Aufsichtsbehörde</Todo></p>
    </LegalFrame>
  );
}
