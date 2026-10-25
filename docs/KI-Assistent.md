# KI-Assistent (PetConnect24)

## Aufbau
- **Oberfläche:** `src/pages/more/Assistant.tsx` (Route `/mehr/assistent`, Menü „Mehr“). Das Gespräch liegt nur im Arbeitsspeicher der Seite.
- **Client:** `src/lib/ai.ts` ruft die Edge Function mit dem Anmelde-Token der Person auf.
- **Backend:** Supabase Edge Function `supabase/functions/pet-ai-chat` (unabhängig vom Frontend, später auch für Android nutzbar).
  - `safety.ts` Eingabeprüfung, Notfall-Stichworte, Antwortprüfung · `context.ts` Auswahl der Tierdaten je Frage · `prompt.ts` Regeln an die KI
  - `breed.ts` Rassendaten aus The Dog API / The Cat API (24 h Zwischenspeicher) · `provider.ts` KI-Anbieter (OpenAI-kompatibel) · `handler.ts` Ablauf · `index.ts` Verdrahtung
- **Limit:** Tabelle `private.ai_usage` + Funktion `public.ai_usage_hit()` (Migration `20261024210000_ai_usage.sql`): 12 Fragen/Stunde und 40/24 h je Person, 300/24 h insgesamt. Gespeichert wird nur eine Zählung, keine Frage, keine Antwort.

## Secrets (Supabase → Edge Functions → Secrets)
| Name | Pflicht | Bedeutung |
|---|---|---|
| `AI_API_KEY` | ja | Schlüssel des KI-Anbieters (Standard: Groq) |
| `AI_BASE_URL` | nein | Standard `https://api.groq.com/openai/v1` |
| `AI_MODEL` | nein | Standard `openai/gpt-oss-120b` |
| `AI_VISION_MODEL` | nein | Bildmodell (z. B. `qwen/qwen3.8-27b`, bei Groq „Preview“). Ohne Wert sind Bild-Anhänge aus (503), Text-Anhänge gehen trotzdem. Freies Limit des Modells in console.groq.com → Settings → Limits prüfen |
| `DOG_API_KEY`, `CAT_API_KEY` | nein | Schlüssel für Rassendaten (ohne Schlüssel keine Rassendaten) |
| `ALLOWED_ORIGINS` | nein | Komma-Liste, Standard `https://petconnect24.com,https://www.petconnect24.com,http://localhost:3000` |

Der Schlüssel steht nie im Frontend oder im Repository. Anbieter wechseln = Secrets ändern, kein Code.

## Datenschutz
- Gesendet wird nur, was die Frage braucht (Themen-Erkennung): immer Name, Tierart, Rasse, Alter, Geschlecht, Allergien-Freitext, Medikamentennamen; bei passender Frage zusätzlich Medikamentendetails, Impfungen, Gewicht, Laborwerte, Vorgeschichte, Dokumenttitel.
- Nie automatisch gesendet: Dokumentinhalte, Chip-Nummer, Praxisdaten, Telefonnummern, Adressen, Personendaten. Der Name der verschreibenden Praxis (`prescribed_by`) geht nicht mehr an die KI.
- Logs enthalten nur Statuscodes, Dauer und Token-Zahlen, keine Fragen, Antworten oder Tierdaten.
- Hinweis an Nutzer im Chat (Text `aiNotice`). **Offen:** Datenschutzerklärung (`Legal.tsx`) muss um den KI-Dienst und den Anbieter ergänzt werden; Auftragsverarbeitungsvertrag und Trainingsnutzung des Anbieters sind von Ihnen zu prüfen (Groq: Standard keine Speicherung, Serverstandort USA).

## Anhänge (Dokument oder Foto) – Schwärzen auf dem Gerät
- Die Person wählt eine Datei oder ein gespeichertes Dokument (PDF/JPEG/PNG/WebP, höchstens 10 MB). Alles Weitere läuft im Browser (`src/components/ai/AttachPanel.tsx`, `src/lib/redact.ts`).
- **PDF mit Text:** Modus „nur Laborwerte“ (Positivliste: Zeilen mit Wert und Einheit) oder „gesamter Text“. Muster (E-Mail, Telefon, IBAN, Chip-Nr., Links, Datum/PLZ-Felder, Name und E-Mail der angemeldeten Person) werden ersetzt durch `[…]`. Die Person sieht und ändert die Vorschau.
- **Fotos und gescannte PDFs:** Die Person zieht schwarze Kästen über alles Persönliche; das Bild wird verkleinert und als flaches JPEG neu kodiert (keine EXIF-Daten).
- **Einwilligung** je Nutzung (Häkchen). Ohne Häkchen: Server antwortet 403 `consent_required`.
- **Server prüft nochmals** (`pii.ts`): Text mit E-Mail/Telefon/IBAN/Chip/Link → 422 `pii_detected`, ohne KI-Aufruf und ohne Zähler. Größen- und Formatprüfung (`validateAttachment`). Bilder zählen dreifach im Limit.
- Nichts wird bei uns gespeichert; Logs enthalten keine Inhalte.
- **Grenze:** Automatische Erkennung ist keine Garantie (Namen in Freitext, Handschrift, Stempel). Rechtlich bleibt es bei Einwilligung, Auftragsverarbeitung und Drittlandübermittlung (nur unumkehrbare Anonymisierung nimmt Daten aus der DSGVO). Datenschutzerklärung vor Freigabe anpassen.

## Sicherheit
Anmeldung per Token (`auth.getUser`), Tierzugriff nur über RLS mit dem Token der Person, Rollen vom Client nur `user`/`assistant`, Datenblöcke gegen Prompt-Injection, Prüfwort gegen Prompt-Auslesen, Größen- und Mengenlimits, CORS auf die App-Domains.

## Tests
`npm test` (Backend-Tests unter `supabase/functions/**`, Client `src/lib/ai.test.ts`). Anhänge: Server-Pfade (`handler.test.ts`, `pii.test.ts`) und Hilfsfunktionen (`redact.test.ts`) sind getestet; die Bedienoberfläche (Zeichnen, PDF-Lesen) ist nur kompiliert, nicht im Browser getestet. Nicht getestet ohne Anmeldung: echter Chat mit dem Anbieter.

## Erweiterung: externe Wissensquellen
Bewusst nicht in Version 1 (keine kostenlose, verlässliche Recherche ohne Kosten/Datenschutzfolgen). Vorgesehen: ein Modul `sources/` mit einheitlicher Schnittstelle `search(query) → [{title,url,snippet}]`, das in `handler.ts` vor dem Anbieteraufruf Treffer als Datenblock anhängt; Quellenangaben nur aus echten Treffern.
