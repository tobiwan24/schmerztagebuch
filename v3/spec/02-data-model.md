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
               settings: { weather: { enabled: boolean,
                                      location?: { lat: number, lon: number, label: string } /* fester Ort, gerundet */,
                                      gpsDefault: boolean /* GPS pro Eintrag standardmäßig an? Standard false */ },
                           quickEntryTemplateId?: string, quickEntryBlockIds?: string[], timezone: string } }

Template     { id, diaryId, name, icon?, color?, order: string /* Fractional Index */, currentVersion: number,
               archived: boolean, createdAt, updatedAt }

TemplateVersion { templateId, version: number /* 1..n */, blocks: BlockDef[], createdAt }
               // unveränderlich; jede Strukturänderung erzeugt eine neue Version

BlockDef     { id, type: BlockType, label, description?, required: boolean, role?: Role, order: string,
               config: BlockConfig /* typabhängig, siehe 05 */ }

Entry        { id, diaryId, templateId, templateVersion: number,
               occurredAt: string /* ISO, vom Nutzer änderbar */, recordedAt: string, updatedAt: string,
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

Dashboard    { id, diaryId, name, order: string, widgets: Widget[] }     // v3.x, siehe 06
SavedFilter  { id, diaryId, name, filter: FilterSpec }                    // siehe 06
ConflictLog  { id, recordId, kind, losingPayload, resolvedAt, seenByUser: boolean }
```

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
(lokal, nicht synchronisiert), `attachmentMeta`. (v3.x: `dashboard`.)

`kind` ist der einzige fachliche Hinweis im Klartext und für die Sync-Reihenfolge nötig (Vorlagen vor Einträgen).

## Backlog v3.x

- Lokale Verschlüsselung über Codec `aes` + Hintergrund-Migration (vorbereitet durch DM-09, DM-12).
- `Dashboard`-Entität und Widgets (06).
- `shares` (Arzt-Link), Integrationen als `devices.kind = 'integration'`.

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
| DM-08 | Ein Eintrag mit Version 1 wird nach Entfernen eines Blocks in Version 2 weiterhin vollständig angezeigt; der entfernte Wert erscheint als archiviertes Feld. | integration |
| DM-09 | Außer `id, diaryId, kind, rev, deleted, codec, localUpdatedAt, occurredAt` steht kein fachliches Feld außerhalb von `payload`/`base`; alle Repository-Integrationstests laufen unverändert grün, wenn statt `plain` ein Test-`aes`-Codec konfiguriert ist, und der Roh-Store enthält dann keine Klartext-Marker. | integration |
| DM-10 | Repository-Schreiboperation und Outbox-Eintrag sind atomar: wirft Codec oder Validierung, existiert weder Record noch Outbox-Eintrag. | integration |
| DM-11 | Multiselect-Werte referenzieren Options-IDs; Umbenennen einer Option ändert historische Werte nicht. | unit |
| DM-12 | Ein Record mit `codec: 'plain'` und einer mit `codec: 'aes'` (Test-Codec) lassen sich in derselben DB nebeneinander lesen (Grundlage der späteren Migration). | integration |
| DM-13 | Ein Push-Lauf sendet nur Chiffretext: der mitgeschnittene Request-Body enthält keine Klartext-Marker aus Testeinträgen. | integration |
