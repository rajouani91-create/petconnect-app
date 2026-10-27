// Angaben für Impressum, Datenschutz und „Konto löschen“ (aus dem Prototyp übernommen, Stand Oktober 2026).
// RECHTLICH PRÜFEN: Impressum und Datenschutzerklärung vor der Einreichung im Play Store prüfen lassen.

export interface LegalInfo {
  /** Name der verantwortlichen Person */
  name: string;
  /** Anschrift, Zeilen mit \n getrennt */
  address: string;
  /** E-Mail für Kontakt, Datenschutz und Konto-Löschung */
  email: string;
  /** Telefon (optional; ohne Angabe entfällt die Zeile im Impressum) */
  phone: string | null;
  /** Stand der Datenschutzerklärung */
  updated: string;
}

export const LEGAL: LegalInfo = {
  name: 'Ahmed Rajouani',
  address: 'Hessenring 104\n65428 Rüsselsheim am Main\nDeutschland',
  email: 'info@petconnect24.com',
  phone: null,
  updated: 'Oktober 2026',
};

/** Fest stehende technische Fakten */
export const FACTS = {
  // RECHTLICH PRÜFEN: Anschrift von Netlify und Link zu dessen Datenschutzerklärung ergänzen?
  hosting: 'Netlify, Inc. (Webseite und App-Dateien)',
  // RECHTLICH PRÜFEN: Angaben zu Supabase (Anschrift, Auftragsverarbeitungsvertrag) ergänzen?
  database: 'Supabase (Datenbank und Anmeldung), Region eu-central-1 (Frankfurt am Main, Deutschland)',
  // RECHTLICH PRÜFEN: Anschrift von Groq, Auftragsverarbeitungsvertrag und Grundlage der Übermittlung in die USA.
  ai: 'Groq, Inc. (USA)',
  // RECHTLICH PRÜFEN: Anschrift von Google Ireland Limited und Link zu den Datenschutzhinweisen von Google ergänzen?
  google: 'Google Ireland Limited (Irland); Konzernmutter Google LLC (USA)',
  push: 'Push-Dienst des jeweiligen Browsers; bei Android: Google Firebase Cloud Messaging',
  maps: '© OpenStreetMap-Mitwirkende, Datenbanklizenz ODbL',
  places: 'GeoNames (geonames.org), Lizenz CC BY 4.0: Postleitzahlen und Orte in Frankreich und den Niederlanden',
} as const;

/** mailto: für „Konto löschen“ – ohne hinterlegte Adresse bleibt der Empfänger leer */
export function deleteAccountMailto(email: string | null, accountEmail: string, subject: string, body: string): string {
  return `mailto:${email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace('{email}', accountEmail))}`;
}
