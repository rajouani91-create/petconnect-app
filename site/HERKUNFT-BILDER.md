# Herkunft der Bilder der Landingpage

Alle vier Smartphone-Darstellungen in der Galerie (und das Bild im Kopfbereich) sind **echte Bildschirmaufnahmen der aktuellen App**,
keine eigens gestalteten Mockups. Es gibt kein HTML/CSS-Mockup mit Markenschriftzug auf der Seite.

Stand der Aufnahmen: 7. November 2026, App-Stand = Branch `feat/app-migration-patch-a` (Patch A + B), mobile Ansicht 360 × 800 px, 3-fach (1080 × 2400).
Die App lief lokal mit einer **simulierten Datenbank** (Beispieldaten: Hund „Luna“, Halter:in „Alex“, Beispielpraxis, Telefonnummer 0000 654321). Es wurden keine echten Konten, Tiere oder Daten verwendet,
und es gab keine Verbindung zu Supabase. Erzeugung: `site/tools/shoot-screens.py` (Uhrzeit fest auf Freitag, 16.10.2026, 08:40 Uhr).

| Datei in `site/img/` | Gezeigte Ansicht (App-Route) | Herkunft | Gezeigte Funktionen vorhanden? |
|---|---|---|---|
| `heute.webp` | Heute (`/app/`) | Aufnahme der aktuellen App, Beispieldaten | ja: Fortschritt, nächste Aufgabe, Tagesplan |
| `erinnerungen.webp` | Erinnerungen (`/app/erinnerungen`) | Aufnahme der aktuellen App, Beispieldaten | ja: Medikamente „Gegeben“ / „Rückgängig“ |
| `tierakte.webp` | Tierakte → Gesundheit → Verlauf (`/app/tier`) | Aufnahme der aktuellen App, Beispieldaten | ja: Verlauf mit Impfungen und Medikamenten, Filter |
| `assistent.webp` | KI-Assistent, Startansicht (`/app/mehr/assistent`) | Aufnahme der aktuellen App, ohne Frage und ohne Antwort | ja: Datenschutzhinweis, Tierauswahl, Schnellfragen |

Frühere Bilder (bis 7.11.2026): `public/screenshots/*.png` (Stand 27.10.2026, vor dem Redesign vom 30.10. und mit „PetConnect“ im App-Kopf).
Sie waren echte Aufnahmen einer älteren App-Version und sind für die Landingpage ersetzt. Die Dateien in `public/screenshots/` (PWA-Manifest) wurden **nicht** verändert.

Die Vorschaubilder für soziale Netzwerke (`site/og/og-de.png`, `og-en.png`) setzen `heute.webp` und `erinnerungen.webp` zusammen und werden mit `og.py`-Vorlage neu erzeugt, wenn sich die Bilder ändern.
