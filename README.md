# Pflegeunion Social Studio

Interne Web-App, mit der das Marketing ohne Design-Kenntnisse Instagram-Posts und -Karussells für die Pflegeunion
erstellt – zu 100 % im Corporate Design – und mit einem Klick veröffentlicht.

**Grundprinzip:** Die KI gestaltet nie. Sie schreibt nur Texte (und Bild-Prompts) in feste Template-Slots.
Layout, Farben, Schriften, Logo-Platzierung und grafische Elemente kommen aus dem Code
(`lib/brand.ts`, `lib/shapes.ts`, `lib/templates.tsx`). Jede KI-Ausgabe wird gegen die CI-Regeln geprüft;
bei Verstößen bekommt die KI die Fehlerliste zurück und korrigiert sich (max. 3 Versuche).

## Ablauf

1. Thema/Briefing eingeben **oder** einen Artikel von pflegeunion.de (URL oder Text) zum Umarbeiten einfügen.
2. Zielgruppe, Anzahl Slides, optional Standort wählen.
3. Fotos hochladen (mehrere, mit Notiz), Team-Porträts aus `assets/people/` auswählen, optional fehlende Fotos per KI.
4. **Karussell erstellen** → fertige Slides (1080×1350) + Caption + Hashtags.
5. Prüfen, Texte direkt bearbeiten (Zeichenzähler), Template/Foto tauschen, Reihenfolge ändern – Live-Vorschau.
6. **Auf Instagram posten** oder **ZIP herunterladen** (PNGs + `caption.txt`). Entwürfe lassen sich speichern und
   per Link an Kolleg:innen zur Freigabe schicken.

**Schneller Weg: Posts vorschlagen.** Die KI schlägt passende Posts vor (Jahreszeit, Zielgruppen-Mix, nur belegte
Fakten, keine Platzhalter). **Post erstellen** macht daraus mit einem Klick ein fertiges Karussell inkl. KI-Bildern;
**Alle als fertige Entwürfe erstellen** baut alle Vorschläge nacheinander (ca. 1–2 Min. pro Post, Tab offen lassen)
und speichert sie unter „Entwürfe“. Veröffentlicht wird nie automatisch – jeder Post wird vorher geprüft.

Ohne API-Keys funktioniert der manuelle Modus (**Leer starten**), die Vorschau und der ZIP-Export.

## Lokal starten

```bash
npm install
cp .env.example .env.local   # Keys eintragen (alle optional für den manuellen Modus)
npm run dev                  # http://localhost:3000
```

Lokal ist die App ohne `APP_PASSWORD` offen; Entwürfe landen ohne Blob in `.data/drafts/`.

```bash
npm test                     # Validierung, Overflow-Test aller Templates, Render-Smoke-Test, KI-Loop, Instagram (gemockt)
npm run typecheck
npm run render:test -- pfad/zu/foto.jpg   # Beispiel-Karussell nach ./out/ rendern (visuelle CI-Kontrolle)
npm run build && bash scripts/smoke-auth.sh   # Basic-Auth gegen den Production-Build prüfen
```

## Deployment auf Vercel

1. Repo in Vercel importieren (Framework: Next.js, keine weiteren Einstellungen nötig).
2. **Storage → Blob** anlegen und mit dem Projekt verbinden (setzt `BLOB_READ_WRITE_TOKEN`). Der Store muss
   **öffentlich** sein – Instagram lädt die Bilder per URL.
3. Environment Variables setzen (siehe `.env.example`), mindestens **`APP_PASSWORD`**. Ohne Passwort antwortet die
   deployte App mit 503 – sie darf nie offen sein, weil sie auf den Firmen-Account posten kann.
4. Fluid Compute aktiv lassen (Standard) – `/api/generate` und `/api/publish` brauchen bis zu 300 s.
5. Deployen. Anmeldung im Browser: beliebiger Benutzername + `APP_PASSWORD`.

## Instagram einrichten (Instagram API mit Instagram-Login)

Meta ändert die Oberflächen regelmäßig – die Schritte beschreiben den Stand Ende 2026.

1. Der Pflegeunion-Instagram-Account muss ein **professioneller Account** (Business oder Creator) sein.
2. Auf [developers.facebook.com](https://developers.facebook.com/) eine App anlegen, Use Case
   **„Nachrichten und Inhalte auf Instagram verwalten"** (Instagram API mit Instagram-Login).
3. Unter **API-Einrichtung mit Instagram-Login** die Berechtigungen `instagram_business_basic` und
   `instagram_business_content_publish` aktivieren.
4. Im Abschnitt **Zugriffstoken generieren** den Pflegeunion-Account hinzufügen und mit dessen Zugangsdaten anmelden
   (die Anmeldung macht eine berechtigte Person selbst – Passwörter gehören nicht in Chats oder Tickets).
   Meta erzeugt einen **langlebigen Token (60 Tage)** → `IG_ACCESS_TOKEN`.
5. Die Account-ID ermitteln und als `IG_USER_ID` speichern:
   ```bash
   curl "https://graph.instagram.com/v24.0/me?fields=user_id,username&access_token=$IG_ACCESS_TOKEN"
   ```
   → Wert von `user_id`.
6. `IG_API_VERSION` auf eine aktuelle Graph-API-Version setzen (Standard `v24.0`).
7. Für die Nutzung mit dem eigenen Account reicht in der Regel der Entwicklungsmodus der App
   (der Account hat eine Rolle in der App). Eine App-Prüfung ist nur nötig, wenn fremde Accounts posten sollen.
8. In der App erscheint der Chip **Instagram ✓**. Vor jedem Post wird das Kontingent geprüft
   (`content_publishing_limit`, 24 h rollierend) und im Bestätigungsdialog angezeigt.

### Neue Meta-Apps: Unified Login

Seit Ende 2026 bietet Meta neuen Apps kein „API-Setup mit Instagram-Login" mehr an, sondern **Unified Login**
(Konfiguration „Instagram API (unified login)", System-User-Token, läuft nicht ab). Die App erkennt den Token-Typ
automatisch: Tokens mit `IG…` laufen über `graph.instagram.com`, Tokens mit `EAA…` über `graph.facebook.com`
(überschreibbar mit `IG_API_HOST`). Für System-User-Tokens entfällt der 60-Tage-Refresh.

Die Social-Studio-App in Meta heißt **Pflegeunion Social Studio** (Business-Portfolio Pflegeunion).

### Token erneuern (alle 60 Tage, nur `IG…`-Tokens)

Der Token muss mindestens 24 h alt und noch gültig sein. Am besten einen Kalendertermin alle ~50 Tage anlegen:

```bash
curl -u team:$APP_PASSWORD -X POST https://<deine-app>.vercel.app/api/refresh-token
```

Die Antwort enthält den neuen Token. Ihn in Vercel als `IG_ACCESS_TOKEN` eintragen und neu deployen
(Umgebungsvariablen lassen sich zur Laufzeit nicht ändern). Abgelaufene Tokens müssen über Schritt 4 neu erzeugt werden.

### KI-Kennzeichnung

Slides mit KI-Bildern werden mit `is_ai_generated=true` veröffentlicht. Lehnt die API-Version den Parameter ab,
postet die App ohne und zeigt einen Hinweis – dann im Beitrag in der Instagram-App „KI-Info" aktivieren.

## Einreichungen aus dem Team

Mitarbeitende reichen über einen **Link ohne Passwort** Fotos und ein paar Sätze ein:
`https://<app>/einreichen?k=<SUBMIT_KEY>` – z. B. in Team-WhatsApp-Gruppen teilen oder als QR-Code an den Standorten
aushängen. Der Link steht im Studio unter **Einreichungen** zum Kopieren bereit.

- 1–3 Fotos, Text (max. 600 Zeichen), optional Vorname (für „📸 Name, Team Standort" in der Caption), Standort.
- Zwei Pflicht-Häkchen: Einwilligung aller erkennbaren Personen; keine Gesundheitsdaten/Dokumente/Adressen im Bild.
- Fotos werden neu kodiert (EXIF/GPS entfernt). **Nichts wird automatisch veröffentlicht**: Einreichungen landen in
  der Prüf-Warteschlange; **Übernehmen** legt die Fotos in die Bibliothek und füllt das Briefing aus.
- **Löschen** entfernt Einreichung und Fotos endgültig (Datensparsamkeit) – abgelehnte Einreichungen bitte löschen.
- Link sperren/erneuern: `SUBMIT_KEY` in Vercel ändern und neu deployen.

## Schriften & Lizenzen

- **Nunito Sans** (OFL) – liegt als `.woff` in `assets/fonts/` (aus `@fontsource/nunito-sans`).
- **Nifty Script** (URW/Thieme) – **lizenzpflichtig, nicht weitergeben.** Wird automatisch geladen, wenn
  `assets/fonts/NiftyScript.(otf|ttf|woff)` existiert, sonst wird **Caveat** (OFL) verwendet und die UI zeigt einen
  Warn-Chip. Die Datei ist per `.gitignore` ausgeschlossen. Nur in ein **privates** Repo committen, wenn die Lizenz
  den Einsatz auf einem Server (Bildrendering) abdeckt – bitte mit dem Einkauf/der Lizenz klären.
- **Minion Pro** ist laut Brand Book nur für Print und wird hier nicht verwendet.

## Offene Punkte (Marketing)

- **TODO: Web-Hex-Werte bestätigen.** Die Logo-PNGs verwenden `#afca0b` / `#00633a` (Print-Konvertierung), das
  Brand Book nennt für Web `#b4d214` (Apfelgrün) / `#006937` (Waldgrün). Die App nutzt die Brand-Book-Werte als
  Tokens und färbt die Logo-Dateien nie um. Bitte die verbindlichen Web-Werte bestätigen (→ `lib/brand.ts`).
- Weitere freigestellte Team-Porträts als PNG mit transparentem Hintergrund nach `assets/people/vorname.png` legen
  (Name wird aus dem Dateinamen abgeleitet). Vorher die Einwilligung der Person zur Veröffentlichung einholen.
- Fakten in `lib/facts.ts` aktuell halten – die KI darf nur diese und Inhalte aus Briefing/Artikel verwenden.

## Architektur

```
app/            page.tsx, layout.tsx, globals.css, studio/ (Editor-UI)
app/api/        render, generate, image, upload, publish, status, refresh-token, drafts, asset
lib/brand.ts    EINZIGE Quelle aller CI-Werte (Farben, Typo, Logo-Regeln, Tonalität, Personas)
lib/facts.ts    erlaubte Unternehmensfakten (editierbar)
lib/schema.ts   Slide-/Karussell-Schema (zod) + Template-Katalog mit Slot-Limits
lib/shapes.ts   Wellen & Kleckse (Catmull-Rom, seeded PRNG)
lib/measure.ts  Textmessung mit echten Font-Metriken (opentype.js), Umbruch, Auto-Size
lib/templates.tsx  8 Templates (Satori-JSX): layout() + render()
lib/render.tsx  next/og → PNG, sharp → JPEG
lib/validate.ts CI-Regeln (Limits, du-Check, Gendern, Emojis, Hashtags, Zahlen, Overflow)
lib/ai.ts       Claude Tool-Use + Selbstkorrektur, Artikel-Import, „Neu formulieren"
lib/aiImage.ts  OpenAI gpt-image-1 mit Stil-Wrapper
lib/instagram.ts  Container → Polling → Publish, Kontingent, Token-Refresh
lib/storage.ts  Vercel Blob (Bilder, Entwürfe) mit lokalem Fallback
middleware.ts   Basic Auth
```

Templates: `cover`, `photo`, `text`, `statement`, `quote`, `team`, `list`, `cta` – Slots und Zeichenlimits stehen in
`lib/schema.ts`. Der Test `tests/overflow.test.ts` rendert jedes Template mit minimalen und maximal langen deutschen
Texten (Umlaute, ß, „Pfleger:innen", lange Komposita) und prüft jede Zeile gegen ihre Box.

## Designentscheidungen

Wo das Brand Book nichts vorgibt, wurde die ruhigere, einfachere Variante gewählt:

- **Textfarben:** Headlines in Waldgrün auf Weiß (Apfelgrün als Textfarbe hat auf Weiß zu wenig Kontrast),
  Sublines und Fließtext in Schwarz. Auf Apfelgrün: Headlines Waldgrün, Sublines Schwarz. Ausnahme Statement-Slide:
  weiße Headline wie vorgegeben (große ExtraBold-Schrift bleibt lesbar).
- **Größen:** Copy 36 px (1080er-Canvas), Subline ≈ 1,2× Copy, Headline 72–144 px (2–4× Copy), automatisch die
  größte Größe, die passt. Zeilenabstand Headline 1,1, Copy 1,2 (wie Brand-Book-Beispiel 11/13,2). Keine Laufweite.
- **Logo:** 440 px breit, Schutzzone X = Höhe des „N" (≈ 31 px, aus dem PNG gemessen), Randabstand 2 X. Der Textrand
  entspricht ebenfalls 2 X – Logo und Text stehen auf einer linken Achse. Weißes Logo (Alternativversion) **nur auf Waldgrün** –
  nie auf Apfelgrün (zu wenig Kontrast, Vorgabe Marketing) und nie auf Fotos. Slides mit apfelgrüner Welle unten
  (Cover, Vollbild-Foto) bekommen darunter ein waldgrünes Logo-Band (Doppelwelle); ein Test prüft die Pixel rund um
  das Logo. auf weißen Inhalts-Slides die kompakte Kreis-Bildmarke unten links.
- **Wellen & Kleckse:** 4 Ankerpunkte pro Welle, abwechselnd auf/ab, leichte Steigung → eine ruhige Bewegung, nie
  Zickzack. Kleckse mit 6 Ankerpunkten und max. 10 % Unregelmäßigkeit. Formen sind pro Slide-ID stabil.
- **Cover:** Foto taucht nur leicht hinter die apfelgrüne Welle, damit möglichst viel Bild sichtbar bleibt.
- **Serie „Kennen Sie schon …":** auf Social Media als **„Kennst du schon …"** (Brand-Book-Regel: Social immer per du).
- **Zitate:** öffnendes deutsches „ in Apfelgrün über dem Zitat, Zitat in der Akzentschrift.
- **Seitenzähler** („2/6") nur auf Erklär- und Listen-Slides, wo er beim Lesen hilft.
- **Vertikale Headline** nur auf der Statement-Slide und nur mit einem Wort ≤ 14 Zeichen.
- **Zeilenumbruch** macht die App selbst mit echten Font-Metriken; der Renderer bricht nie um. Gemessen wird
  konservativ (max. aus Breite mit und ohne Kerning).
- **du-Check** ist streng: Auch „Sie" am Satzanfang wird markiert (könnte „sie/they" sein) – im Zweifel umformulieren.
  In KI-Ausgaben ist es ein Fehler, im Editor eine Warnung. Ausnahme: wörtliche Zitate.
- **Zahlen:** Die KI darf nur Zahlen aus `lib/facts.ts`, dem Briefing oder dem Artikel verwenden (1–10 sind frei).
- **Hashtags:** max. 30, `#Pflegeunion` ist Pflicht. Caption inkl. Hashtags max. 2.200 Zeichen, max. 3 Emojis.
- **Sicherheit:** Artikel-Import nur von `pflegeunion.de` (Schutz vor SSRF), andere Quellen als Text einfügen.
  Remote-Bilder nur aus Vercel Blob/pflegeunion.de. Uploads werden neu kodiert, EXIF/GPS-Daten entfernt.
  Entwürfe liegen als JSON unter zufälligen IDs im (öffentlichen) Blob-Store – sie enthalten nur Texte und Bild-URLs,
  keine Zugangsdaten.
- **KI-Modell:** `claude-sonnet-5-5` (per `ANTHROPIC_MODEL` änderbar), Effort „medium", mit serverseitigem
  Fallback bei Ablehnungen (`fallbacks: "default"`).
- **KI-Bilder:** nie für Team-Porträts; Prompts mit Namen aus `assets/people/` werden abgelehnt.
