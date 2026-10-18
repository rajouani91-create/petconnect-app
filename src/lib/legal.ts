// Angaben für Impressum, Datenschutz und „Konto löschen“.
// WICHTIG: Vor der Einreichung im Play Store von Ahmed ausfüllen und rechtlich prüfen lassen.
// Solange ein Wert null ist, zeigen die Seiten gut sichtbar „[BITTE ERGÄNZEN: …]“.

export interface LegalInfo {
  /** Name der verantwortlichen Person oder Firma */
  name: string | null;
  /** Anschrift (Straße, PLZ Ort) */
  address: string | null;
  /** E-Mail für Kontakt, Datenschutz und Konto-Löschung */
  email: string | null;
  /** Telefon (optional) */
  phone: string | null;
}

export const LEGAL: LegalInfo = { name: null, address: null, email: null, phone: null };

/** Fest stehende technische Fakten (keine Rechtstexte) */
export const FACTS = {
  hosting: 'Netlify, Inc. (Webseite und App-Dateien)',
  database: 'Supabase (Datenbank und Anmeldung), Region eu-central-1 (Frankfurt am Main, Deutschland)',
  push: 'Push-Dienst des jeweiligen Browsers; bei Android: Google Firebase Cloud Messaging',
  maps: '© OpenStreetMap-Mitwirkende, Datenbanklizenz ODbL',
} as const;

/** mailto: für „Konto löschen“ – ohne hinterlegte Adresse bleibt der Empfänger leer */
export function deleteAccountMailto(email: string | null, accountEmail: string, subject: string, body: string): string {
  return `mailto:${email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace('{email}', accountEmail))}`;
}
