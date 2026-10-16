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
  lib/        supabase.ts, database.types.ts, api.ts, sharing.ts, photo.ts, usePetPhoto.ts, templates.ts, time.ts, validate.ts, labels.ts
  i18n/       index.ts (t, Fallback), I18nProvider.tsx, de.ts … no.ts (11 Sprachen)
  auth/       AuthProvider.tsx, RequireAuth.tsx, authErrors.ts
  pets/       PetsProvider.tsx (Tierliste, aktives Tier)
  pages/      Login, Register, ResetPassword, Today, Routine, Pet, PetNew, More, Appointments, Emergency, Invite
  components/ AppShell, BottomNav, Switch, SpeciesPicker, Dialog, Field, PetForm, PetSwitcher, PetAvatar, PetPhotoControls,
              PetSharedWith, FamilyCard, RoleChoice, Icons
  styles/     tokens.css (aus dem Prototyp), app.css, fonts.css + lokale Schriften
public/       manifest.webmanifest, Icons
```

Seiten: `/login`, `/registrieren`, `/passwort-neu`, `/` (Heute), `/termine`, `/tier`, `/tier/neu`,
`/alltag`, `/mehr`, `/notfall`, `/einladung/:token`.

## Familie & Mithalter:innen

Ein Tier hat genau eine **Haupthalter:in** (`owner`) und bis zu 5 weitere Personen. Alle sehen dieselbe
Tierakte, denselben Tagesplan und dieselben Häkchen. Schema:
`..\Technik\supabase\migrations\20261016150000_gemeinsam_betreuen.sql` und `…153000_familie_rechte_fotos.sql`.

| Rolle | Anzeige | Darf |
|---|---|---|
| `owner` | Haupthalter:in | alles, einladen, Rechte ändern, Personen entfernen, Tier löschen |
| `carer` | Mithalter:in | Tierakte, Tagesplan, Häkchen, Erinnerungen, Foto ändern |
| `viewer` | Nur ansehen | alles sehen, nichts ändern (keine Bearbeiten-Knöpfe, Häkchen gesperrt) |

- **Verwalten** unter „Mehr“ → Karte „Familie & Mithalter:innen“ (`src/components/FamilyCard.tsx`):
  Personen gruppiert nach Person mit Rechten und Tieren, offene Einladungen (teilen, zurückziehen),
  „Rechte ändern“ (gilt für alle meine Tiere dieser Person), „Entfernen“, Abschnitt „Mit Ihnen geteilt“
  mit „Betreuung beenden“.
- **Einladen** über `rpc('create_pet_invite', { p_name, p_role, p_pet_ids })`. Link
  `/einladung/<code>`, gültig 7 Tage, für eine Person. Fehlercodes → Texte in `src/lib/sharing.ts`.
- **Annehmen** (`/einladung/:token`, `src/pages/Invite.tsx`): Vorschau per `invite_preview` (JSON),
  Annehmen per `accept_pet_invite` (Array von Tier-IDs). Ohne Anmeldung merkt sich die App den Code in
  `localStorage` (`pc-pending-invite`) und springt nach Anmeldung/Registrierung zurück. Beim Abmelden
  wird der Eintrag gelöscht. Die Seite ist auch ohne eigenes Tier erreichbar.
- Die Tier-Seite zeigt nur „Geteilt mit …“ und den Link „Personen verwalten“.
- **Heute** zeigt „erledigt von {Name}“ und lädt Plan und Häkchen beim Zurückkehren ins Fenster und
  jede Minute neu (noch ohne Realtime).
- Rechte-Prüfung in der App: `canEdit(role)` und `myRole(pet)` aus `PetsProvider`. Durchgesetzt werden
  die Rechte in der Datenbank (RLS).
- Der Einladungscode wird nie in der Konsole ausgegeben.

## Tierfoto

- Privater Storage-Bucket `pet-photos` (max. 5 MB, JPEG/PNG/WebP), Pfad `<pet_id>/<uuid>.jpg`,
  gespeichert in `pets.photo_path`. Ansehen: alle Betreuer; ändern: Haupthalter:in und Mithalter:innen.
- Vor dem Hochladen verkleinert der Browser das Bild (`src/lib/photo.ts`): längste Seite 1200 px,
  JPEG mit Qualität 0,85, Ausrichtung aus EXIF (`createImageBitmap(…, { imageOrientation: 'from-image' })`).
  Danach wird `photo_path` gesetzt und das alte Foto gelöscht. Beim Löschen eines Tieres wird zuerst das
  Foto entfernt.
- Anzeige über `createSignedUrl(path, 3600)`; die Links werden je Foto zwischengespeichert, bis sie
  ablaufen (`src/lib/usePetPhoto.ts`). Kleines rundes Foto in Tier-Umschalter, „Als Nächstes“-Karte und
  Notfall-Seite (`src/components/PetAvatar.tsx`), groß auf der Tier-Seite.

## Hinweise

- Datenbank-Schema: `..\Technik\supabase\migrations\` (hier nicht ändern). Neue Typen nach
  Schema-Änderungen nach `src/lib/database.types.ts` kopieren.
- Uhrzeiten und „heute“ beziehen sich immer auf die Zeitzone Europe/Berlin.
- Deutsch (Sie-Form) ist die Referenzsprache. Fehlt ein Text in einer anderen Sprache,
  erscheint der deutsche Text und eine Warnung in der Konsole.
