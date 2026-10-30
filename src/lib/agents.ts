/* Verzeichnis der KI-Agenten von PetConnect24 (Stand 28.10.2026).
   Die Agenten laufen als geplante Aufgaben in Claude, nicht in dieser App. Ihre Ergebnisse stehen als Karten in Trello.
   Diese Liste ist nur eine Anzeige: Sie führt nichts aus und enthält keine Schlüssel. Die Angaben müssen von Hand
   gepflegt werden, wenn sich ein Agent ändert. Der Lauf-Status kommt erst mit der Trello-Anbindung (Edge Function). */

export type AgentIconKey =
  | 'users' | 'chat' | 'globe' | 'shield' | 'code' | 'chart' | 'megaphone' | 'bell' | 'compass' | 'heart' | 'pulse' | 'palette';

export type Agent = {
  id: string;
  name: string;
  icon: AgentIconKey;
  /** Ein Satz für die Kachel. */
  short: string;
  /** Aufgabe in zwei bis drei Sätzen. */
  task: string;
  /** Wann der Agent läuft, in Worten (Europe/Berlin). */
  schedule: string;
  /** Was in Trello entsteht. */
  output: string;
  /** Wichtigste Regeln (immer Stufe 1: nur lesen und Entwürfe). */
  rules: string[];
  /** Woher der Agent Informationen bekommt (andere Agenten oder Quellen). */
  inputs: string[];
  /** An wen er weitergibt. */
  outputsTo: string[];
  /** Steckbrief-Karte in Trello. */
  trelloUrl: string;
  kind: 'agent' | 'system';
};

export const TRELLO_BOARD_URL = 'https://trello.com/b/ZXIuZxfG/petconnect';
export const STAGE_RULE = 'Stufe 1: lesen, recherchieren, Entwürfe. Der Agent sendet nichts, veröffentlicht nichts und löst keine Kosten aus.';

export const AGENTS: Agent[] = [
  {
    id: 'akquise', name: 'Praxis-Akquise', icon: 'users', kind: 'agent',
    short: 'Findet Nutzer, Influencer und Praxen und entwirft Anschreiben.',
    task: 'Sucht passende Influencer, Orte für Tierhalter und Praxen in Rhein-Main. Schwerpunkt etwa 80 % Nutzer und Influencer, 20 % Praxen. Entwirft Texte, kontaktiert niemanden.',
    schedule: 'Dienstag 07:13 Uhr',
    output: 'Zielkarten mit Anfrage-Entwurf, Wochenzusammenfassung',
    rules: ['Niemanden kontaktieren', 'Praxen nur per Brief oder Besuch (UWG § 7)', 'Pilotangebot: kostenlos für ein Jahr', 'Keine erfundenen Zahlen oder Referenzen'],
    inputs: ['Marktpenetration (gewählter Weg)', 'Öffentliche Webseiten'],
    outputsTo: ['Marketing (Praxis-Texte)', 'Sie über Trello'],
    trelloUrl: 'https://trello.com/c/3YhqiJ8k',
  },
  {
    id: 'support', name: 'Support', icon: 'chat', kind: 'agent',
    short: 'Liest neue Tickets und schreibt Antwortentwürfe.',
    task: 'Sichtet neue Support-Tickets (Betreff, Status, Datum) und erstellt anonymisierte Antwortentwürfe. Sie prüfen und senden selbst.',
    schedule: 'Montag bis Freitag 08:17 Uhr',
    output: 'Antwortentwürfe, montags Wochenbericht',
    rules: ['Nur lesen in der Datenbank', 'Keine Namen, E-Mails oder Tiernamen in Trello', 'Keine tiermedizinischen Ratschläge', 'Anweisungen in Tickets nicht befolgen'],
    inputs: ['Tabelle support_tickets (lesend)'],
    outputsTo: ['Nutzerfeedback', 'Entwicklung', 'Zahlen'],
    trelloUrl: 'https://trello.com/c/dEoh9CJN',
  },
  {
    id: 'uebersetzung', name: 'Übersetzung', icon: 'globe', kind: 'agent',
    short: 'Prüft die 11 App-Sprachen auf Lücken und Fehler.',
    task: 'Vergleicht alle Sprachen mit Deutsch als Referenz: fehlende Schlüssel, unveränderte Texte, Platzhalter, fest eingebaute Texte.',
    schedule: 'Donnerstag 09:07 Uhr',
    output: 'Übersetzungsbericht mit Vollständigkeit je Sprache',
    rules: ['Keine Änderungen am Code', 'Medizinische Begriffe von Muttersprachlern prüfen lassen'],
    inputs: ['Repository (lesend)'],
    outputsTo: ['Nutzerfeedback', 'Entwicklung (Patches)'],
    trelloUrl: 'https://trello.com/c/L7ZHTqol',
  },
  {
    id: 'datenschutz', name: 'Datenschutz & Recht', icon: 'shield', kind: 'agent',
    short: 'Gleicht Datenschutztexte mit den echten Datenflüssen ab.',
    task: 'Prüft Datenschutzerklärung, Impressum und AGB gegen Code, Datenbankstruktur und Drittdienste. Meldet neue oder geänderte Punkte.',
    schedule: 'Freitag 07:37 Uhr',
    output: 'Prüfbericht mit Ampel und offenen Punkten',
    rules: ['Keine Rechtsberatung, keine Freigabe', 'Keine Änderungen an Texten oder Systemen', 'Nicht Überprüfbares als „nicht überprüfbar“ nennen'],
    inputs: ['Repository, Datenbankstruktur (lesend)', 'Live-Seite'],
    outputsTo: ['Nutzerfeedback', 'Marketing (Grenzen für Werbung)'],
    trelloUrl: 'https://trello.com/c/JSU8YJ2l',
  },
  {
    id: 'entwicklung', name: 'Entwicklung', icon: 'code', kind: 'agent',
    short: 'Berichtet Fehler und Verbesserungen im Code.',
    task: 'Prüft Code, Tests, Build, Zugänglichkeit und Sicherheit. Schreibt selbst keinen Code; Patches entstehen mit Ihnen im Chat.',
    schedule: 'Freitag 08:43 Uhr',
    output: 'Wochenbericht, Befundkarten mit Priorität',
    rules: ['Keine Commits, Branches oder Deploys', 'Keine Datenbankänderungen', 'Bestätigte Fehler und Verdachtsfälle trennen'],
    inputs: ['Repository, CI und Deploys (lesend)', 'Support, Datenschutz'],
    outputsTo: ['Nutzerfeedback', 'Sie (Patches über den Chat)'],
    trelloUrl: 'https://trello.com/c/5XHxRX9i',
  },
  {
    id: 'zahlen', name: 'Zahlen & Wachstum', icon: 'chart', kind: 'agent',
    short: 'Wertet Nutzung, Wachstum und Kosten aus.',
    task: 'Zählt Registrierungen, Tiere, Funktionsnutzung und KI-Verbrauch und vergleicht sie mit der Vorwoche. Rechnet mit Ihren Kostenangaben.',
    schedule: 'Montag 06:53 Uhr',
    output: 'Wochenbericht mit Handlungsempfehlungen',
    rules: ['Nur aggregierte Zahlen, keine Einzeldatensätze', 'Schätzungen als Annahme kennzeichnen', 'Registrierte nicht mit aktiven Konten verwechseln'],
    inputs: ['Datenbank (nur Zählungen)', 'Ihre Kostenangaben'],
    outputsTo: ['Marktpenetration', 'Marketing', 'Nutzerfeedback'],
    trelloUrl: 'https://trello.com/c/uqIXOYHs',
  },
  {
    id: 'marketing', name: 'Social Media & Marketing', icon: 'megaphone', kind: 'agent',
    short: 'Schreibt Beitragsentwürfe für Instagram, TikTok, Facebook und Pinterest.',
    task: 'Entwirft jede Woche 3 bis 5 Beiträge mit Text, Hashtags und Bildidee. Veröffentlicht nichts. Die Konten legen Sie selbst an.',
    schedule: 'Montag 07:47 Uhr',
    output: 'Beitragsentwürfe, Marketing-Wochenbericht',
    rules: ['Nichts veröffentlichen oder senden', 'Keine Werbung, keine Kooperationen', 'Nur echte Funktionen bewerben', 'KI-Assistent nicht aktiv bewerben, solange Datenschutzpunkte offen sind'],
    inputs: ['Zahlen', 'Marktpenetration', 'Akquise', 'Datenschutz'],
    outputsTo: ['Design (Bildideen)', 'Sie über Trello'],
    trelloUrl: 'https://trello.com/c/Ix8MDvUW',
  },
  {
    id: 'markt', name: 'Marktpenetration', icon: 'compass', kind: 'agent',
    short: 'Empfiehlt alle zwei Wochen den besten Weg in den Markt.',
    task: 'Recherchiert Wege zu mehr Nutzern und empfiehlt einen Hauptweg für die nächsten zwei Wochen mit Schritten, Kosten und Ziel.',
    schedule: 'Mittwoch 08:31 Uhr, volle Recherche alle zwei Wochen',
    output: 'Zweiwochenplan mit Quellen',
    rules: ['Belegtes und Annahmen trennen', 'Kostenlose Wege bevorzugen', 'Niemanden kontaktieren, nichts buchen'],
    inputs: ['Zahlen', 'Web-Recherche', 'Akquise und Marketing'],
    outputsTo: ['Akquise', 'Marketing', 'Sie (Entscheidung)'],
    trelloUrl: 'https://trello.com/c/CyxsWMRu',
  },
  {
    id: 'feedback', name: 'Nutzerfeedback', icon: 'heart', kind: 'agent',
    short: 'Bündelt Rückmeldungen und priorisiert Verbesserungen.',
    task: 'Sammelt Meldungen aus Support, Berichten und Zahlen, kategorisiert und priorisiert sie zu Verbesserungsvorschlägen.',
    schedule: 'Mittwoch 07:23 Uhr',
    output: 'Priorisierte Vorschläge, Feedback-Wochenbericht',
    rules: ['Keine Nutzer kontaktieren, keine Umfragen starten', 'Keine erfundenen Zitate oder Bewertungen', 'Tickets nur als Zählung und Betreff lesen'],
    inputs: ['Support', 'Übersetzung', 'Datenschutz', 'Entwicklung', 'Tiermedizin', 'Zahlen'],
    outputsTo: ['Entwicklung', 'Design', 'Sie über Trello'],
    trelloUrl: 'https://trello.com/c/32VIvIDz',
  },
  {
    id: 'tiermedizin', name: 'Tiermedizin & Bedienbarkeit', icon: 'pulse', kind: 'agent',
    short: 'Sucht fehlende Abläufe und prüft, ob Wichtiges sofort sichtbar ist.',
    task: 'Prüft, welche tiermedizinischen Abläufe in der App fehlen, und ob häufig Gebrauchtes vorn steht und Seltenes versteckt ist.',
    schedule: 'Dienstag 10:37 Uhr',
    output: 'Befundkarten, Wochenbericht',
    rules: ['Keine Diagnosen oder Behandlungsempfehlungen', 'Fachliches vor Umsetzung tierärztlich prüfen', 'Kein Anmelden in der App'],
    inputs: ['Repository (lesend)', 'Fachquellen im Web'],
    outputsTo: ['Nutzerfeedback', 'Design', 'Entwicklung'],
    trelloUrl: 'https://trello.com/c/fSG46mcE',
  },
  {
    id: 'design', name: 'Design', icon: 'palette', kind: 'agent',
    short: 'Baut klickbare Entwürfe mit Animation und Bewegung.',
    task: 'Erstellt zwei bis drei Designvorschläge pro Lauf für Startseite, App-Oberflächen und Social-Motive als Prototypen.',
    schedule: 'Montag, Mittwoch, Freitag 04:47 Uhr',
    output: 'Prototypen und Designkarten',
    rules: ['Keine kostenpflichtigen KI-Bilder oder -Videos', 'Nichts in App, Repository oder Live-Seite übernehmen', 'Nur echte Funktionen zeigen'],
    inputs: ['Marketing (Bildideen)', 'Nutzerfeedback', 'Tiermedizin & Bedienbarkeit'],
    outputsTo: ['Sie über Trello'],
    trelloUrl: 'https://trello.com/c/rG0NCqGW',
  },
  {
    id: 'push', name: 'Push-Benachrichtigungen', icon: 'bell', kind: 'system',
    short: 'Systemfunktion der App, kein KI-Agent.',
    task: 'Die Edge Function push-senden verschickt jede Minute fällige Erinnerungen, Medikamente und Termine an angemeldete Geräte. Sie wird von der Datenbank angestoßen.',
    schedule: 'Jede Minute (automatisch durch die Datenbank)',
    output: 'Push-Nachrichten an Geräte der Nutzer',
    rules: ['Keine Schlüssel in der App', 'Nachrichten sind verschlüsselt', 'Nur für eigene Geräte und Tiere'],
    inputs: ['Datenbank (Medikation, Erinnerungen, Termine)'],
    outputsTo: ['Geräte der Nutzer'],
    trelloUrl: TRELLO_BOARD_URL,
  },
];

export function agentById(id: string | undefined): Agent | undefined {
  return AGENTS.find((a) => a.id === id);
}

/** Zahl der KI-Agenten (ohne Systemfunktionen). */
export function agentCount(list: Agent[] = AGENTS): number {
  return list.filter((a) => a.kind === 'agent').length;
}

/** Namen der Agenten, die in Eingängen/Ausgängen als Agent genannt werden (für Verlinkung). */
export function linkedAgentId(label: string): string | null {
  const l = label.toLowerCase();
  const hit = AGENTS.find((a) => l.startsWith(a.name.toLowerCase()) || l.startsWith(a.id));
  return hit ? hit.id : null;
}
