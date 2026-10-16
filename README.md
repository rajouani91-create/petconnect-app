# PetConnect App (Halter-Seite)

Erstes lauffähiges Grundgerüst der PetConnect-App: Konto, Tiere, Tagesplan.
Vite + React + TypeScript (strict), Supabase als Datenbank und Anmeldung.

## Starten

Voraussetzung: Node.js 20 oder neuer.

```powershell
cd "$HOME\Desktop\Projekt Petconnect\App"
npm install
npm run dev
```

Die App läuft dann unter **http://localhost:3000** (fester Port, weil Supabase die
Bestätigungs-Mails dorthin zurückleitet).

## Zugangsdaten (.env.local)

Die Datei `.env.local` gehört direkt in den Ordner `App` (neben `package.json`).
Sie steht in `.gitignore` und wird nicht eingecheckt. Vorlage: `.env.example`.

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Nur den öffentlichen **Publishable Key** verwenden, niemals `service_role` oder `sb_secret_…`.
Die Sicherheit kommt aus Row Level Security in der Datenbank: Jede Person sieht nur ihre eigenen Zeilen und die der Tiere, die sie mitbetreut.
Nach einer Änderung an `.env.local` den Dev-Server neu starten.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver auf Port 3000 |
| `npm run build` | Typprüfung und Produktions-Build nach `dist/` |
| `npm run preview` | Build lokal ansehen (Port 3000) |
| `npm run typecheck` | nur Typprüfung (`tsc`) |
| `npm test` | Logik-Tests mit Vitest |

## Aufbau

```
src/
  lib/        supabase.ts, database.types.ts, api.ts, templates.ts, time.ts, validate.ts, labels.ts
  i18n/       index.ts (t, Fallback), I18nProvider.tsx, de.ts … no.ts (11 Sprachen)
  auth/       AuthProvider.tsx, RequireAuth.tsx, authErrors.ts
  pets/       PetsProvider.tsx (Tierliste, aktives Tier)
  pages/      Login, Register, ResetPassword, Today, Routine, Pet, PetNew, More, Appointments, Emergency, Invite
  components/ AppShell, BottomNav, Switch, SpeciesPicker, Dialog, Field, PetForm, PetSwitcher, CareSection, Icons
  styles/     tokens.css (aus dem Prototyp), app.css, fonts.css + lokale Schriften
public/       manifest.webmanifest, Icons
```

Seiten: `/login`, `/registrieren`, `/passwort-neu`, `/` (Heute), `/termine`, `/tier`, `/tier/neu`,
`/alltag`, `/mehr`, `/notfall`, `/einladung/:token`.

## Gemeinsam betreuen

Ein Tier hat genau einen **Besitzer** und beliebig viele **Mitbetreuer**. Alle sehen und ändern
dasselbe Tier, denselben Tagesplan und dieselben Häkchen. Schema:
`..\Technik\supabase\migrations\20261016150000_gemeinsam_betreuen.sql`.

- **Einladen** (`/tier`, Abschnitt „Betreuung“, nur Besitzer): „Person einladen“ erzeugt einen Link
  `/einladung/<code>`, gültig 7 Tage, für eine Person. Teilen über `navigator.share` oder Kopieren.
  Offene Einladungen lassen sich zurückziehen, Mitbetreuer entfernen, das Tier löschen.
- **Annehmen** (`/einladung/:token`): Ohne Anmeldung merkt sich die App den Code in
  `localStorage` (`pc-pending-invite`) und springt nach Anmeldung/Registrierung automatisch zurück.
  Die Seite ist auch ohne eigenes Tier erreichbar.
- **Mitbetreuer** können die Betreuung selbst beenden; danach verschwindet das Tier.
- **Heute** zeigt „erledigt von {Name}“, wenn jemand anderes abgehakt hat, und lädt Plan und Häkchen
  beim Zurückkehren ins Fenster sowie jede Minute neu (noch ohne Realtime).
- Geteilte Tiere tragen im Tier-Umschalter ein Personen-Symbol.
- Code: `src/lib/sharing.ts` (Link, Fehlertexte, „erledigt von“), `src/lib/api.ts` (Betreuer,
  Einladungen), `src/components/CareSection.tsx`, `src/pages/Invite.tsx`.
- Der Einladungscode wird nie in der Konsole ausgegeben und für offene Einladungen nicht geladen.

## Hinweise

- Datenbank-Schema: `..\Technik\supabase\migrations\` (hier nicht ändern). Neue Typen nach
  Schema-Änderungen nach `src/lib/database.types.ts` kopieren.
- Uhrzeiten und „heute“ beziehen sich immer auf die Zeitzone Europe/Berlin.
- Deutsch (Sie-Form) ist die Referenzsprache. Fehlt ein Text in einer anderen Sprache,
  erscheint der deutsche Text und eine Warnung in der Konsole.
