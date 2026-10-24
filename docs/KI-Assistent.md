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
| `DOG_API_KEY`, `CAT_API_KEY` | nein | Schlüssel für Rassendaten (ohne Schlüssel keine Rassendaten) |
| `ALLOWED_ORIGINS` | nein | Komma-Liste, Standard `https://petconnect24.com,https://www.petconnect24.com,http://localhost:3000` |

Der Schlüssel steht nie im Frontend oder im Repository. Anbieter wechseln = Secrets ändern, kein Code.

## Datenschutz
- Gesendet wird nur, was die Frage braucht (Themen-Erkennung): immer Name, Tierart, Rasse, Alter, Geschlecht, Allergien-Freitext, Medikamentennamen; bei passender Frage zusätzlich Medikamentendetails, Impfungen, Gewicht, Laborwerte, Vorgeschichte, Dokumenttitel.
- Nie gesendet: Dokumentinhalte, Chip-Nummer, Praxisdaten, Telefonnummern, Adressen, Personendaten.
- Logs enthalten nur Statuscodes, Dauer und Token-Zahlen, keine Fragen, Antworten oder Tierdaten.
- Hinweis an Nutzer im Chat (Text `aiNotice`). **Offen:** Datenschutzerklärung (`Legal.tsx`) muss um den KI-Dienst und den Anbieter ergänzt werden; Auftragsverarbeitungsvertrag und Trainingsnutzung des Anbieters sind von Ihnen zu prüfen (Groq: Standard keine Speicherung, Serverstandort USA).

## Sicherheit
Anmeldung per Token (`auth.getUser`), Tierzugriff nur über RLS mit dem Token der Person, Rollen vom Client nur `user`/`assistant`, Datenblöcke gegen Prompt-Injection, Prüfwort gegen Prompt-Auslesen, Größen- und Mengenlimits, CORS auf die App-Domains.

## Tests
`npm test` (Backend-Tests unter `supabase/functions/**`, Client `src/lib/ai.test.ts`). Nicht getestet ohne Anmeldung: echter Chat mit dem Anbieter.

## Erweiterung: externe Wissensquellen
Bewusst nicht in Version 1 (keine kostenlose, verlässliche Recherche ohne Kosten/Datenschutzfolgen). Vorgesehen: ein Modul `sources/` mit einheitlicher Schnittstelle `search(query) → [{title,url,snippet}]`, das in `handler.ts` vor dem Anbieteraufruf Treffer als Datenblock anhängt; Quellenangaben nur aus echten Treffern.
