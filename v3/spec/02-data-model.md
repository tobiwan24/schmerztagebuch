# 02 — Datenmodell

## Identitäten

- **Alle IDs sind UUID v7** (RFC 9562): 48 Bit Unix-Millisekunden + Zufall. Erzeugt in `core/ids.ts` mit
  `crypto.getRandomValues` (kein `crypto.randomUUID` — fehlt auf älterem iOS). Monoton innerhalb derselben Millisekunde.
- Es gibt **keine lokalen Autoincrement-IDs**. Jede Referenz (Eintrag → Vorlage, Wert → Block, Wert → Option)
  läuft über diese IDs. Damit sind Import, Sync und Export ohne Remapping möglich.
- Auch Multiselect-Optionen und Body-Map-Punkte haben stabile IDs.

## Entitäten (fachlich, Klartext nur auf dem Gerät)

```ts
Diary        { id, name, subject: 'human' | 'animal' | 'other', icon?, color?, createdAt,
               updatedAt?: string, hlc?: string /* ab M14; für Konfliktauflösung „ganzer Datensatz per HLC" */,
               settings: { weather: { enabled: boolean,
                                      location?: { lat: number, lon: number, label: string } /* fester Ort, gerundet */,
                                      gpsDefault: boolean /* GPS pro Eintrag standardmäßig an? Standard false */ },
                           quickEntryTemplateId?: string, quickEntryBlockIds?: string[], timezone: string } }

Template     { id, diaryId, name, icon?, color?, order: string /* Fractional Index */, currentVersion: number,
               archived: boolean, createdAt, updatedAt }

TemplateVersion { templateId, version: number /* 1..n */, blocks: BlockDef[], createdAt }
               // unveränderlich; jede Strukturänderung erzeugt eine neue Version

BlockDef     { id, type: BlockType, label, description?, required: boolean, role?: Role, order: string, hideLabel?: boolean /* Label im Formular ausblenden; Struktur, neue Version */,
               config: BlockConfig /* typabhängig, siehe 05 */ }

Entry        { id, diaryId, templateId, templateVersion: number,
               occurredAt: string /* ISO, vom Nutzer änderbar (auch zum Nachtragen); bei Zeitraum = Beginn */,
               period?: { start: string, end: string } /* optionaler Zeitraum: beide ISO-Datum (ganztägig) oder beide ISO-Zeitpunkt */,
               recordedAt: string, updatedAt: string,
               authorId: string /* User- oder Integration-ID */,
               values: Record<BlockId, BlockValue>,
               tags: string[],
               meta: EntryMeta, hlc: string }

EntryMeta    { source: 'app' | 'quick' | 'shortcut' | 'import' | 'migration-v2' /* v3.x: 'api' */,
               timezone: string, weather?: Weather, weatherPending?: boolean,
               location?: { lat: number, lon: number, origin: 'diary' | 'gps' } /* auf 1 Dezimalstelle gerundet */ }

Weather      { provider: 'open-meteo', fetchedAt, observedAt /* volle Stunde */,
               temperatureC, apparentTemperatureC, pressureHpa, pressureDelta24hHpa, humidityPct,
               precipitationMm, cloudCoverPct, windKmh, weatherCode }

Attachment   { id, diaryId, entryId, kind: 'image' | 'pdf', mime, sizeBytes, createdAt }   // Inhalt als separater verschlüsselter Blob

Dashboard    { id, diaryId, name, order: string, widgets: Widget[], hlc, updatedAt }   // v3.x (M21), siehe 06
SavedFilter  { id, diaryId, name, filter: FilterSpec }                    // siehe 06
ConflictLog  { id, recordId, kind, losingPayload, resolvedAt, seenByUser: boolean }
```

Tagebuch-Einstellungen ändert nur `owner` (09). Der feste Ort wird gerundet (1 Dezimalstelle) gespeichert; `label` ist der Anzeigename aus der Ortssuche oder ‚Aktueller Standort‘.

`Role` = `outcome` · `symptom` · `medication` · `trigger` · `activity` · `sleep` · `mood` · `function` · `note`.
Rollen sind optional und frei kombinierbar (mehrere Blöcke können dieselbe Rolle tragen).

## Reihenfolge

- `Template.order`, `BlockDef.order`, `Dashboard.order` sind **Fractional-Index-Strings** (`core/fractional-index.ts`).
- Umsortieren ändert nur das verschobene Element → konfliktarm beim Sync, keine Neu-Nummerierung.
- Gleichstand (gleicher String auf zwei Geräten) wird deterministisch über die ID aufgelöst.

## Versionierung von Vorlagen

- Änderungen an Name/Icon/Farbe/Order ändern nur `Template`, keine neue Version.
- Änderungen an Blöcken (hinzufügen, entfernen, Typ, Konfiguration, Label, Rolle) erzeugen `TemplateVersion n+1`.
- Ein Eintrag referenziert die Version, mit der er erfasst wurde. Beim Anzeigen/Bearbeiten wird der Wert über die
  **Block-ID** auf die aktuelle Version abgebildet; entfernte Blöcke werden als „Archiviertes Feld" angezeigt, nicht gelöscht.
- Typwechsel eines Blocks ist **nicht** erlaubt (UI bietet „neuen Block anlegen" an) — verhindert stilles Umdeuten
  historischer Werte (Lehre aus ISS-014).

## Lokale Speicherung (Dexie `stb-v3`)

| Store | Inhalt | Indizes (nur nicht-sensible Felder) |
|---|---|---|
| `records` | `{ id, diaryId, kind, rev, deleted, codec: 'plain' \| 'aes', payload, base?, localUpdatedAt, occurredAt? }` | `id`, `[diaryId+kind]`, `[diaryId+occurredAt]`, `localUpdatedAt` |
| `outbox` | ausstehende Operationen (siehe 04) | `++seq`, `recordId` |
| `blobs` | verschlüsselte Anhänge | `id` |
| `keys` | verpackte Schlüssel (UMK-Wraps, DK-Wraps) | `id` |
| `sync_state` | Cursor pro Tagebuch, Modus | `diaryId` |
| `device` | lokale Gerätedaten (nicht-extrahierbarer Device-Key) | `id` |

- **v3.0: lokal unverschlüsselt, aber nachrüstbar.** `payload` und `base` (zuletzt synchronisierte Version für den
  3-Wege-Merge, 04) laufen ausschließlich durch einen `PayloadCodec { id, encode(obj, ctx), decode(raw, ctx) }`
  (`apps/web/src/data/codec/`). v3.0 nutzt `plain` (JSON). Lokale Verschlüsselung (v3.x) = neuer Codec `aes` mit DK und
  AAD wie in 03 plus eine Hintergrund-Migration, die Records von `plain` auf `aes` umschreibt; das Feld `codec` pro
  Record erlaubt gemischte Bestände während dieser Migration.
- **Index-Felder sind vom Payload getrennt:** Nur `id, diaryId, kind, rev, deleted, codec, localUpdatedAt, occurredAt`
  stehen außerhalb des Payloads. `occurredAt` ist das einzige fachliche Index-Feld (für Zeitraum-Abfragen); bei lokaler
  Verschlüsselung entfällt es oder wird auf Tagesgenauigkeit gekürzt (Entscheidung in v3.x).
- Suche und Analyse arbeiten auf einem im Speicher aufgebauten Arbeitsset (06), nie auf Dexie-Indizes über
  Payload-Inhalte. Dadurch ändert der Codec-Tausch nichts an Suche/Analyse.
- Zum Server gehen Records **immer** verschlüsselt (AES-GCM mit DK, 03): Verschlüsselung beim Push, Entschlüsselung
  beim Pull, beides in der Sync-Engine.
- Repositories (`apps/web/src/data/repositories`) kapseln Codec, Validierung (zod) und Outbox-Einträge
  in **einer** Dexie-Transaktion.

## Server-Speicherung (SQLite)

| Tabelle | Spalten |
|---|---|
| `users` | `id, username, created_at` |
| `credentials` | `id, user_id, public_key, counter, transports, created_at, last_used_at` |
| `user_keys` | `user_id, kind ('identity-pub'|'umk-wrap-passkey'|'umk-wrap-backup'), credential_id?, blob` |
| `devices` | `id, user_id, kind ('device'|'integration' — v3.x), name_ct, public_key, created_at, revoked_at` |
| `diaries` | `id, created_at` |
| `memberships` | `diary_id, principal_id (user|integration), role, key_epoch, wrapped_dk, created_at, revoked_at` |
| `records` | `id, diary_id, kind, rev, seq, deleted, ciphertext, size, updated_at` |
| `blobs` | `id, diary_id, size, path, created_at` |
| `shares` | *(v3.x, Arzt-Link)* `id, ciphertext, expires_at, max_views, views, created_by` |
| `intake_keys` | `diary_id, public_key, token_hash, created_by, created_at, revoked_at` (08) |
| `intake_items` | `id, diary_id, sealed /* ECDH-versiegelt */, created_at` — gelöscht nach Abholung |
| `invitations` | `id, diary_id, inviter_id, ciphertext, expires_at, accepted_at` |

Record-`kind`s in v3.0: `diary`, `template`, `templateVersion`, `entry`, `savedFilter`, `intakeKey`, `conflictLog`
(lokal, nicht synchronisiert), `attachmentMeta`, `bodymapImage` (eigenes Body-Map-Bild eines Tagebuchs, A-024). (v3.x: `dashboard`.)

`kind` ist der einzige fachliche Hinweis im Klartext und für die Sync-Reihenfolge nötig (Vorlagen vor Einträgen).

## Erweiterungen v3.x

- **Lokale Verschlüsselung (M23):** Codec `aes` (DK des Tagebuchs, AAD wie in 03), Opt-in „Daten auf dem Gerät verschlüsseln“; Migration im Hintergrund plain→aes, fortsetzbar und idempotent (Outbox und `base` werden mitverschlüsselt); `occurredAt` wird im Index auf den Tag gekürzt. Ohne Entsperren keine Daten (App-Sperre). Der persistierte Suchindex steht in 06.
- **`Dashboard`-Entität (M21):** siehe 06. **`shares`** (Arzt-Link, M18): siehe 07. **Integrationen** (`devices.kind = 'integration'`, M24): siehe 03.

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| DM-01 | `newId()` erzeugt gültige UUID v7; 10.000 IDs in einer Schleife sind eindeutig und lexikografisch aufsteigend. | unit |
| DM-02 | Zeitstempel einer UUID v7 ist aus der ID rekonstruierbar (±1 ms). | unit |
| DM-03 | zod-Schemas lehnen einen Eintrag ab, dessen `values` eine Block-ID enthält, die in der referenzierten Vorlagenversion nicht existiert. | unit |
| DM-04 | Fractional Index: zwischen zwei beliebigen Keys lässt sich immer ein Key erzeugen; 1.000 zufällige Einfügungen ergeben eine korrekt sortierte Liste. | unit |
| DM-05 | Gleiche Order-Strings werden deterministisch über die ID sortiert (gleiche Reihenfolge auf allen Geräten). | unit |
| DM-06 | Block hinzufügen/entfernen/umbenennen erzeugt eine neue `TemplateVersion`; Name/Icon/Order ändern erzeugt keine. | unit |
| DM-07 | Typwechsel eines bestehenden Blocks wird von der Domänenfunktion abgelehnt. | unit |
| DM-08 | Ein Eintrag mit Version 1 wird nach Entfernen eines Blocks in Version 2 weiterhin vollständig angezeigt; der entfernte Wert erscheint am Ende als Feld (Wert bleibt sichtbar; in der Detailansicht ohne Hinweis, RDM-028 P5). | integration |
| DM-09 | Außer `id, diaryId, kind, rev, deleted, codec, localUpdatedAt, occurredAt` steht kein fachliches Feld außerhalb von `payload`/`base`; alle Repository-Integrationstests laufen unverändert grün, wenn statt `plain` ein Test-`aes`-Codec konfiguriert ist, und der Roh-Store enthält dann keine Klartext-Marker. | integration |
| DM-10 | Repository-Schreiboperation und Outbox-Eintrag sind atomar: wirft Codec oder Validierung, existiert weder Record noch Outbox-Eintrag. | integration |
| DM-11 | Multiselect-Werte referenzieren Options-IDs; Umbenennen einer Option ändert historische Werte nicht. | unit |
| DM-12 | Ein Record mit `codec: 'plain'` und einer mit `codec: 'aes'` (Test-Codec) lassen sich in derselben DB nebeneinander lesen (Grundlage der späteren Migration). | integration |
| DM-13 | Ein Push-Lauf sendet nur Chiffretext: der mitgeschnittene Request-Body enthält keine Klartext-Marker aus Testeinträgen. | integration |
| DM-14 | `Diary` hat optionale `updatedAt`/`hlc`; Tagebücher ohne diese Felder bleiben gültig. `updateDiarySettings` setzt beide, rundet den festen Ort auf 1 Dezimalstelle und lehnt Schnelleintrag-Blöcke ab, die nicht zur gewählten Vorlage gehören; im Konflikt gewinnt der höhere HLC. | unit |
| DM-15 | `core/dashboard.ts`: Schema, Widget-Konfiguration je Art, Reihenfolge per Fractional Index; das Export-Schema enthält Dashboards. | unit |
| DM-16 | Codec `aes`: Roundtrip, falscher Schlüssel bzw. falsche AAD → Fehler, gemischte Bestände (plain und aes) lesbar. | unit |
| DM-17 | Migration plain→aes (fake-indexeddb): idempotent, nach Abbruch fortsetzbar, Outbox und `base` mitverschlüsselt, Index auf den Tag gekürzt. | integration |
| DM-18 | Schalter „Daten auf dem Gerät verschlüsseln“ an → danach enthält IndexedDB keinen Klartext-Marker mehr; die App arbeitet entsperrt normal; Auto-Sicherung und Export funktionieren. | e2e |
| DM-19 | Leistung und Akku mit lokaler Verschlüsselung auf dem iPhone mit echtem Datenbestand. | manual |
