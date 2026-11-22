# 07 — Export, Import, Backup

Exporte sind der Weg zum Arzt und zu anderen Werkzeugen (auch KI: Datei hochladen). Sie entstehen **auf dem Gerät**.

## Formate

| Format | Zweck | Inhalt |
|---|---|---|
| **JSON v1** (`.stb.json`) | Maschinenlesbar, vollständig, Re-Import | siehe unten |
| **CSV long** | Statistik/Tabellen (R, Python, Excel) | eine Zeile pro Eintrag × Block-Wert |
| **CSV wide** | Schneller Überblick in Excel | eine Zeile pro Eintrag, eine Spalte pro Block (aktuelle Version) |
| **PDF** | Arzt/Therapie | Zusammenfassung + Tabelle + Diagramme + Body-Maps |
| **Backup** (`.stbbackup`) | Wiederherstellung | JSON v1, verschlüsselt |

Jeder Export kann **vollständig** oder **gefiltert** (`FilterSpec`, 06) erstellt werden; der Filter steht im Export.

### JSON v1 (selbstbeschreibend)

```ts
{
  format: 'stb-export', formatVersion: 1, exportedAt, appVersion, filter?: FilterSpec,
  diaries: [{
    diary: { id, name, subject, timezone },
    templates: [{ id, name, versions: [{ version, blocks: [{ id, type, label, role?, unit?, scale?: {min,max},
                                                           options?: [{ id, label }] }] }] }],
    entries:   [{ id, templateId, templateVersion, occurredAt, recordedAt, updatedAt, author?, tags,
                  values: { [blockId]: BlockValue }, meta: { source, timezone, weather?, location? } }]
    // außerdem je Tagebuch: savedFilters, bodymapImages, attachments, notificationRules (Hinweis-Regeln, A-115; fehlt in älteren Dateien → leer)
  }],
  glossary: { blockTypes: {...}, roles: {...}, weatherFields: {...} }   // deutsche Kurzbeschreibung jedes Feldes
}
```

- Zu JSON v1 gibt es ein veröffentlichtes **JSON Schema** (`packages/export/schema/stb-export-v1.json`, aus zod generiert).
- Anhänge sind in JSON v1 optional (Base64, Schalter „mit Anhängen"); Standard: ohne.

### CSV

- UTF-8 mit BOM. Zwei Profile: **Standard** (`,` Trenner, `.` Dezimalpunkt, ISO-Datum) und **Excel (DE)**
  (`;` Trenner, `,` Dezimalkomma, `TT.MM.JJJJ HH:MM`).
- Long-Spalten: `entry_id, occurred_at, diary, template, template_version, block_id, block_label, role, type,
  value_number, value_text, option_id, option_label, unit, source`.
- Multiselect: long = eine Zeile pro Option; wide = Labels mit `; ` verbunden.
- Felder werden RFC-4180-konform maskiert; Formel-Injection wird verhindert (`=`, `+`, `-`, `@` am Zellanfang → `'` vorangestellt).

### PDF

- Portiert aus v2 (`src/utils/pdfExport.ts`): Layouts `table | cards | dashboard` (Tabelle A4 quer; Karten A4 hoch, je Eintrag eine Karte;
  Dashboard: Diagrammbild des Zeitraums, Kennzahlen der `outcome`-Blöcke, Häufigkeiten der im Dialog gewählten Multiselect-Blöcke), Layout-Auswahl, Body-Map-Bilder mit Größe
  `a4 | a5 | a6 | none`, optionaler PDF-Passwortschutz.
- Neu: **Deckblatt-Zusammenfassung** für den Arzttermin — Zeitraum, Tage mit Eintrag, Kennzahlen der `outcome`-Blöcke,
  Medikamententage, Ereignisse (`doctor`) und wahlweise die Standard-Diagramme aus 06.
- Archivierte Felder alter Vorlagenversionen werden mit ausgegeben (gekennzeichnet).

## Import

- Akzeptiert: JSON v1, `.stbbackup`, v2-Backup-Datei (Weiterleitung an Migration, 11).
- Ablauf: Datei prüfen (zod) → **Vorschau** (Anzahl Tagebücher/Vorlagen/Einträge, neu vs. vorhanden) → Import.
- Import ist **idempotent**: Datensätze mit bekannter ID werden nach den Merge-Regeln aus 04 zusammengeführt, nicht
  dupliziert. Zweimaliger Import derselben Datei ändert nichts.
- Import in ein anderes Tagebuch als das Original ist möglich („als Kopie importieren" → neue IDs, Referenzen konsistent umgeschrieben).

## Backup

- `.stbbackup` = JSON v1 (mit Anhängen), verschlüsselt mit AES-GCM; Schlüssel per PBKDF2 (600k, 03) aus dem
  **Backup-Code** oder einem separat gewählten Backup-Passwort. Header (Klartext): Format, Version, KDF-Parameter, Salt.
- **local-only:** Backup-Erinnerung alle n Tage (Standard 7, einstellbar), solange kein Backup erstellt wurde
  (Nachfolger von v2 `BackupReminder`). **cloud-primary:** keine Erinnerung, manueller Export jederzeit möglich.
- Wiederherstellung auf einem neuen Gerät funktioniert auch ohne Konto (local-only).

## Auto-Sicherung

- Nachfolger von v2 `autoBackup` (dort Klartext in localStorage; wegen E2E nicht übernommen). Format wie `.stbbackup`, verschlüsselt mit einem
  zufälligen Sicherungsschlüssel, der wie die UMK mit allen vorhandenen Faktoren (Passwort, Backup-Code, Passkey) verpackt ist; die
  Wiederherstellung braucht einen davon (EXP-17).
- Ablage in OPFS (Fallback: eigene IndexedDB `stb-v3-autobackup`), getrennt von `stb-v3`; nur die letzte Sicherung bleibt.
- Auslöser: nach Änderungen höchstens 1×/Tag sowie vor dem Aktivieren eines Updates.
- Hinweis „Backup wiederherstellen" (Datei oder Auto-Sicherung) bei leerer DB nach dem Onboarding, wegklickbar (EXP-16).

## Erweiterungen v3.x

### Arzt-Link (M18)

Das Gerät erzeugt einen Zufallsschlüssel K (256 Bit) und verschlüsselt das Berichtspaket (gefilterte Einträge als JSON-v1-Teilmenge + PDF) mit AES-GCM, AAD `stb/v3/share|<id>`. Der Server speichert nur Chiffretext in `shares` (`expires_at` ≤ 30 Tage, Standard 14; `max_views` 1–20, Standard 5; ≤ 10 MB). Link: `/r/<id>#k=<base64url K>`; das Fragment erreicht den Server nie (Referrer-Policy no-referrer). Die Ansicht `/r/:id` braucht keine Anmeldung, ist nur lesend und lädt per `lazy` ohne Daten- oder Sync-Module. Nur im Konto-Modus und nur online verfügbar; ein Erklärdialog weist darauf hin, dass jeder mit dem Link den Bericht lesen kann. Kein QR-Code.

### Integrationen, client-sdk, MCP (M24)

Server-Schnittstelle (A-127): Der Owner legt je Tagebuch bis zu 10 Integrationen an (`POST/GET /api/v1/diaries/:id/integrations`, `DELETE …/:integrationId`; Body: verschlüsselter Name, öffentlicher Schlüssel, Token-Hash, DK-Wrap, Epoche). Die Integration liest mit `Authorization: Bearer stbi_…` über `GET /api/v1/integration/records?since=&limit=` (Chiffretext aller Record-Arten, ihr Wrap und die Epoche; 120 Anfragen/min je Integration). Jede andere Anfrage mit einem Integrations-Token (Push, Pull, Blobs, Konto) → 403 `integration-read-only`. Eine DK-Rotation widerruft die Integrationen des Tagebuchs.

Nur lesende API (Chiffretext + Wrap, Tokens siehe 03); `packages/client-sdk` entschlüsselt; `packages/client-sdk` (A-128): `connectIntegration({ accessString, baseUrl?, fetch? })` prüft den Zugangsstring (Prüfsumme), `sync()` pullt seitenweise (Cursor erst nach dem Anwenden), entpackt den DK mit dem Integrationsschlüssel und entschlüsselt; `snapshot()` liefert Tagebuch, Vorlagen, Versionen und Einträge typisiert (Schemas aus `core`), nicht lesbare Records unter `skipped` mit Grund. Fehler sind unterscheidbar (`unauthenticated`, `rate-limited` mit Wartezeit, `forbidden`, `network`, …). Abhängigkeiten: nur `core`, `crypto`, `sync-protocol`.

`apps/mcp` (stdio, lokal beim Nutzer, kein gehosteter Server) bietet die Tools `list_diaries`, `search_entries`, `get_entry`, `stats`. Konfiguration über `STB_ACCESS_STRING` (und optional `STB_BASE_URL`); alle Tools sind nur lesend (A-129), Auswertung und Suche kommen aus `analysis`. Einrichtung: `apps/mcp/README.md`.

### Medikamenten-Block im Export (M16)

CSV: eine Zelle „Ibuprofen 400 mg 08:00; …“; JSON v1 (Export-Schema neu erzeugt) und PDF (Tabelle/Karten) enthalten die Positionen; Import-Roundtrip verlustfrei.

## Backlog v3.x

- FHIR-Export (Nicht-Ziel in v3, nicht eingeplant).

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| EXP-01 | JSON-v1-Export der Fixture validiert gegen das veröffentlichte JSON Schema. | unit |
| EXP-02 | Roundtrip: Export → Import in leere DB ergibt identische Tagebücher, Vorlagen(-versionen), Einträge (tiefer Vergleich). | integration |
| EXP-03 | Zweimaliger Import derselben Datei erzeugt keine Duplikate und keine Änderungen. | integration |
| EXP-04 | „Als Kopie importieren" erzeugt neue IDs; alle Referenzen (Vorlage, Block, Option) bleiben konsistent. | integration |
| EXP-05 | CSV long/wide entspricht für die Fixture den Golden Files (beide Profile). | unit |
| EXP-06 | CSV maskiert Trenner, Anführungszeichen, Zeilenumbrüche und verhindert Formel-Injection. | unit |
| EXP-07 | Gefilterter Export enthält genau die Einträge des Filters und den Filter selbst. | unit |
| EXP-08 | PDF enthält Deckblatt mit Kennzahlen, Tabelle und Body-Map-Bilder in der gewählten Größe (Text-Extraktion + Bildanzahl geprüft). | integration |
| EXP-09 | Passwortgeschütztes PDF lässt sich ohne Passwort nicht öffnen. | integration |
| EXP-10 | `.stbbackup` mit Backup-Code wiederherstellbar; falscher Code → `wrong-backup-code`; Datei enthält keine Klartext-Marker. | integration |
| EXP-11 | Ungültige oder manipulierte Importdatei wird mit verständlicher Meldung abgelehnt, die DB bleibt unverändert. | integration |
| EXP-12 | Backup-Erinnerung erscheint in local-only nach Ablauf der Frist und nicht in cloud-primary. | e2e |
| EXP-13 | PDF-Export eines Monats mit echten Daten ist für einen Arzttermin brauchbar (Lesbarkeit, Vollständigkeit). | manual |
| EXP-14 | PDF-Layout „Karten" (A4 hoch, je Eintrag eine Karte mit Zeit, Vorlage, allen Werten, Body-Map-Bild in gewählter Größe) wird erzeugt; Text per pdfjs prüfbar; Passwortschutz wirkt. | integration |
| EXP-15 | PDF-Layout „Dashboard": Diagrammbild des Zeitraums, Kennzahlen der `outcome`-Blöcke und Häufigkeiten der ausgewählten Multiselect-Blöcke; Auswahl der Multiselects im Export-Dialog. | integration |
| EXP-16 | Start mit leerer v3-DB (nach dem Onboarding, keine Einträge) zeigt den Hinweis „Backup wiederherstellen" (Datei oder Auto-Sicherung), wegklickbar; nicht bei vorhandenen v2-Daten (dann Migration). | e2e |
| EXP-17 | Auto-Sicherung: nach Änderungen höchstens 1×/Tag und vor dem Aktivieren eines Updates eine verschlüsselte Backup-Datei (Format 07) im Gerätespeicher getrennt von `stb-v3`; nach Löschen von `stb-v3` mit Passwort/Backup-Code vollständig wiederherstellbar; Speicher enthält keine Klartext-Marker. | integration |
| EXP-18 | Verlauf: Knopf „Exportieren" übernimmt die aktuell angewendeten Filter (FilterSpec, Tagebuch-Umschalter) in den Export-Dialog (PDF-Layouts, CSV, JSON); die Datei enthält nur die gefilterten Einträge; „Mehr → Export" bleibt. | e2e |
| EXP-19 | PDF-Download: die **heruntergeladene Datei** (Playwright-Download, alle drei Layouts, mit und ohne Passwort) hat MIME `application/pdf`, beginnt mit `%PDF-`, endet mit `%%EOF`, lässt sich mit pdfjs öffnen (Seitenzahl ≥ 1, erwarteter Text auf Seite 1; mit Passwort nur mit diesem). Regression für „kein funktionsfähiges PDF" (User-Feedback 2026-11-16). | e2e |
| EXP-20 | Medikamenten-Block im Export: CSV (eine Zelle „Ibuprofen 400 mg 08:00; …“), JSON v1 (Export-Schema neu erzeugt), PDF-Tabelle/Karten; Import-Roundtrip verlustfrei. | unit |
| EXP-21 | `crypto/report-share.ts`: Roundtrip; falscher Schlüssel, falsche AAD oder manipulierter Chiffretext ergeben einen eindeutigen Fehler; der Schlüssel taucht nie im Request auf. | unit |
| EXP-22 | Server: `POST /api/v1/shares` (angemeldet, ≤ 10 MB, Grenzen für Ablauf und Aufrufe), `GET /api/v1/shares/:id` ohne Anmeldung (zählt Aufrufe, 410 nach Ablauf, Erreichen von max_views oder Widerruf), `GET /api/v1/shares` und `DELETE` nur für den Ersteller, Aufräumen abgelaufener Links, Rate-Limit, kein Body-Logging. | integration |
| EXP-23 | Export-Dialog „Arzt-Link erstellen“ (Filter vorbelegt wie EXP-18, Ablauf, max. Aufrufe, Erklärdialog) → Link kopieren oder teilen. Der Link in einem frischen Browser-Kontext zeigt den Bericht (Tabelle, Diagramme, PDF-Download). Abgelaufen oder falscher Schlüssel → verständliche Meldung. | e2e |
| EXP-24 | Liste aktiver Links mit Aufrufen und Ablauf; Widerrufen → die Ansicht meldet „widerrufen“. In local-only Hinweis statt Funktion. | e2e |
| EXP-25 | Arzt-Link auf fremdem Gerät (Arzt-PC/Handy) öffnen und Darstellung prüfen. | manual |
| EXP-26 | Dashboard (ANA-32) als PNG exportierbar und als Grundlage für das PDF-Layout „Dashboard“. | e2e |
| EXP-27 | Einstellungen → Integrationen: anlegen (einmalige Anzeige), Liste, widerrufen. | e2e |
| EXP-28 | `apps/mcp`: Tools über einen In-Process-MCP-Client gegen die Fixture; nur lesend. | integration |
| ARC-08 | `client-sdk` gegen den In-Process-Server: anmelden, Pull, Entschlüsseln, typisierte Einträge; Abhängigkeitsregeln (`client-sdk` → nur `core`, `crypto`, `sync-protocol`). | integration |
