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

- Portiert aus v2 (`src/utils/pdfExport.ts`): Tabellenlayout, Layout-Auswahl, Body-Map-Bilder mit Größe
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

## Backlog v3.x

- Lesende REST-API mit API-Tokens und `client-sdk` (Chiffretext + clientseitige Entschlüsselung).
- MCP-Server (`apps/mcp`) auf Basis von `client-sdk`.
- Arzt-Link: befristeter, verschlüsselter Bericht (`shares`), Schlüssel im URL-Fragment.
- FHIR-Export.

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
