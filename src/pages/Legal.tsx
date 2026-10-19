import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n/I18nProvider';
import { useAuth } from '../auth/AuthProvider';
import { FACTS, LEGAL } from '../lib/legal';
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

const Address = () => (
  <p className="pre">
    {LEGAL.name}
    {'\n'}
    {LEGAL.address}
  </p>
);
const Mail = () => <a className="link" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;

export function Imprint() {
  return (
    <LegalFrame title="Impressum">
      <h2>Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</h2>
      <Address />
      {/* Bei Gewerbe/Firma: Rechtsform, Register, USt-ID ergänzen. */}
      <h2>Kontakt</h2>
      <p>E-Mail: <Mail /></p>
      {LEGAL.phone && <p>Telefon: {LEGAL.phone}</p>}
      <h2>Verbraucherstreitbeilegung</h2>
      <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
      <h2>Haftung für Links</h2>
      <p>Diese Website kann Links zu externen Websites Dritter enthalten, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Links umgehend.</p>
      <h2>Kartendaten</h2>
      <p>{FACTS.maps}</p>
    </LegalFrame>
  );
}

export function Privacy() {
  return (
    <LegalFrame title="Datenschutzerklärung">
      <p className="muted">Stand: {LEGAL.updated}</p>

      <h2>1. Verantwortlicher</h2>
      <Address />
      <p>E-Mail: <Mail /></p>

      <h2>2. Überblick</h2>
      <p>PetConnect ist eine App für Tierhalter:innen. Es gibt keine Werbung, kein Tracking, keine Analyse-Dienste und keine Cookies zu Werbe- oder Analysezwecken.</p>

      <h2>3. Konto und Inhalte</h2>
      <p>Für Ihr Konto verarbeiten wir Ihre E-Mail-Adresse, Ihren Anzeigenamen und Ihre gewählte Sprache. Dazu kommen die Angaben, die Sie zu Ihren Tieren eintragen – zum Beispiel Tierakte, Medikamente, Termine, Erinnerungen, Notfallkarte, Fotos, Dokumente und Versicherung.</p>
      <p>Zweck ist die Bereitstellung der Funktionen der App. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Nutzungsvertrag). Die Daten werden gespeichert, bis Sie Ihr Konto oder den jeweiligen Eintrag löschen.</p>
      <p>Angaben, die Sie mit Familie, Mithalter:innen oder einer Betreuung (Sitter) teilen, sehen nur die Personen, die Sie selbst eingeladen haben.</p>
      {/* RECHTLICH PRÜFEN: Gesundheitsdaten von Tieren sind keine besonderen Kategorien nach Art. 9 DSGVO – Einordnung bestätigen lassen. */}

      <h2>4. Hosting</h2>
      <p>Die Webseite und die App-Dateien liegen bei {FACTS.hosting}. Beim Aufruf verarbeitet der Anbieter automatisch Informationen, die Ihr Browser übermittelt:</p>
      <ul>
        <li>IP-Adresse</li>
        <li>Datum und Uhrzeit des Zugriffs</li>
        <li>aufgerufene Seite und übertragene Datenmenge</li>
        <li>Browsertyp, Betriebssystem und zuvor besuchte Seite (Referrer)</li>
      </ul>
      <p>Zweck ist die sichere Auslieferung der Webseite. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO; unser berechtigtes Interesse liegt im sicheren und fehlerfreien Betrieb. Die Logfiles werden nach den Fristen des Anbieters gelöscht. Netlify, Inc. sitzt in den USA; dabei können Daten in die USA übermittelt werden.</p>
      {/* RECHTLICH PRÜFEN: Grundlage der Übermittlung in die USA (z. B. Angemessenheitsbeschluss/Zertifizierung) nennen? */}

      <h2>5. Datenbank und Anmeldung</h2>
      <p>Konto, Anmeldung und Ihre Inhalte werden bei {FACTS.database} gespeichert. Die Daten liegen in Frankfurt am Main. Supabase, Inc. ist ein Unternehmen mit Sitz in den USA.</p>
      {/* RECHTLICH PRÜFEN: Auftragsverarbeitungsvertrag mit Supabase und Hinweis auf möglichen Zugriff aus den USA. */}

      <h2>6. Push-Benachrichtigungen</h2>
      <p>Nur wenn Sie sie auf einem Gerät aktivieren. Übertragen über den {FACTS.push} (Google, USA). Die Benachrichtigungen enthalten Tiername, Medikament oder Termin und Uhrzeit; sie werden verschlüsselt übertragen.</p>
      <p>Rechtsgrundlage ist Ihre Einwilligung durch das Aktivieren auf dem Gerät (Art. 6 Abs. 1 lit. a DSGVO). Sie können sie jederzeit unter „Mehr → Benachrichtigungen“ widerrufen.</p>

      <h2>7. Standort und Praxissuche</h2>
      <p>Ihr Standort wird nur nach Ihrem Klick auf „Mein Standort“ für die jeweilige Suche verwendet und nicht gespeichert. Praxisdaten: {FACTS.maps}.</p>

      <h2>8. Lokale Speicherung im Browser</h2>
      <p>Einige Angaben speichert die App im lokalen Speicher Ihres Browsers, weil die jeweilige Funktion sonst nicht möglich ist (§ 25 Abs. 2 Nr. 2 TDDDG):</p>
      <ul>
        <li>Ihre Anmeldung (Sitzung), damit Sie angemeldet bleiben</li>
        <li>die gewählte Sprache</li>
        <li>das zuletzt gewählte Tier</li>
        <li>der zuletzt gesuchte Ort bzw. die PLZ in der Praxissuche (kein Standort)</li>
        <li>ein Einladungscode, bis Sie die Einladung nach der Anmeldung annehmen</li>
        <li>die Einstellung „Nicht mehr anzeigen“ beim Hinweis auf Benachrichtigungen</li>
        <li>die Dateien der App, damit sie auch ohne Internet startet</li>
      </ul>
      <p>Sie können diese Einträge jederzeit über die Einstellungen Ihres Browsers löschen.</p>

      <h2>9. Schriftarten</h2>
      <p>Alle Schriftarten sind lokal eingebunden; es wird keine Verbindung zu Google Fonts aufgebaut.</p>

      <h2>10. Kontakt per E-Mail</h2>
      <p>Wenn Sie uns per E-Mail kontaktieren, verarbeiten wir Ihre E-Mail-Adresse und den Inhalt Ihrer Nachricht, um Ihre Anfrage zu beantworten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit Ihre Anfrage auf einen Vertrag zielt, im Übrigen Art. 6 Abs. 1 lit. f DSGVO. E-Mails an {LEGAL.email} werden über den Domain-Anbieter Namecheap, Inc. (USA) an ein Postfach bei Google (Gmail) weitergeleitet. Dabei können Daten in die USA übermittelt werden. Wir löschen Ihre Nachricht, sobald sie nicht mehr erforderlich ist, sofern keine gesetzlichen Aufbewahrungspflichten bestehen.</p>

      <h2>11. Konto löschen</h2>
      <p>Sie können die Löschung Ihres Kontos jederzeit anfragen – in der App unter „Mehr → Konto → Konto löschen“ oder per E-Mail an <Mail />.</p>

      <h2>12. Ihre Rechte</h2>
      <p>Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (Art. 21). Eine erteilte Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3). Für Anfragen genügt eine E-Mail an {LEGAL.email}.</p>
      <p>Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO). Zuständig ist: Der Hessische Beauftragte für Datenschutz und Informationsfreiheit, Gustav-Stresemann-Ring 1, 65189 Wiesbaden.</p>

      <h2>13. Automatisierte Entscheidungen</h2>
      <p>Eine automatisierte Entscheidungsfindung oder ein Profiling im Sinne von Art. 22 DSGVO findet nicht statt. Symptom- oder Medikamentenfunktionen geben keine tierärztliche Diagnose und berechnen keine Dosierungen.</p>

      <h2>14. Änderungen</h2>
      <p>Wir passen diese Datenschutzerklärung an, wenn sich die App oder die rechtlichen Anforderungen ändern.</p>
    </LegalFrame>
  );
}
