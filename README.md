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
Die Sicherheit kommt aus Row Level Security in der Datenbank: Jede Person sieht nur ihre eigenen Zeilen.
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
  pages/      Login, Register, ResetPassword, Today, Routine, Pet, PetNew, More, Appointments, Emergency
  components/ AppShell, BottomNav, Switch, SpeciesPicker, Dialog, Field, PetForm, PetSwitcher, Icons
  styles/     tokens.css (aus dem Prototyp), app.css, fonts.css + lokale Schriften
public/       manifest.webmanifest, Icons
```

Seiten: `/login`, `/registrieren`, `/passwort-neu`, `/` (Heute), `/termine`, `/tier`, `/tier/neu`,
`/alltag`, `/mehr`, `/notfall`.

## Hinweise

- Datenbank-Schema: `..\Technik\supabase\migrations\` (hier nicht ändern). Neue Typen nach
  Schema-Änderungen nach `src/lib/database.types.ts` kopieren.
- Uhrzeiten und „heute“ beziehen sich immer auf die Zeitzone Europe/Berlin.
- Deutsch (Sie-Form) ist die Referenzsprache. Fehlt ein Text in einer anderen Sprache,
  erscheint der deutsche Text und eine Warnung in der Konsole.
