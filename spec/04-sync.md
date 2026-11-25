# 04 — Sync, Betriebsmodi, Offline

## Modi

| Modus | Verhalten |
|---|---|
| `local-only` | Keine Server-Kommunikation (außer optional Wetter/LLM nach Freigabe). Outbox wird nicht befüllt. |
| `cloud-primary` | Jeder Schreibvorgang landet in der Outbox und wird sofort (online) bzw. später (offline) synchronisiert. Server ist maßgeblich für Reihenfolge (`seq`). |

Moduswechsel:
- `local-only → cloud-primary`: Konto anlegen/anmelden, alle lokalen Records in die Outbox, Erst-Push.
- `cloud-primary → local-only`: vollständiger Pull, Prüfung auf leere Outbox, dann Gerät lokal entkoppeln
  (Server-Daten bleiben, bis der Nutzer sie explizit löscht).

## Outbox

```ts
OutboxOp { seq, recordId, diaryId, kind, op: 'upsert' | 'delete', baseRev: number, createdAt, attempts, lastError? }
```

- Pro `recordId` gibt es höchstens eine ausstehende Operation (neuere ersetzt ältere, `baseRev` bleibt die älteste).
- Records tragen `rev` (Integer, vom Server vergeben/bestätigt) und `hlc` (im verschlüsselten Payload).

## Protokoll

| Endpunkt | Beschreibung |
|---|---|
| `POST /api/v1/sync/push` | `{ diaryId, ops: [{ recordId, kind, baseRev, deleted, ciphertext }] }` → pro Op `applied {rev, seq}` oder `conflict {server: {rev, ciphertext, deleted}}` |
| `GET /api/v1/sync/pull?diaryId&since&limit` | Records mit `seq > since`, sortiert, paginiert (`limit` ≤ 500, `nextSince`, `hasMore`) |
| `PUT /api/v1/blobs/:id` / `GET /api/v1/blobs/:id` | verschlüsselte Anhänge, max. 20 MB |

- Alle Sync-Antworten: `Cache-Control: no-store`. Der Service Worker cached **nie** `/api/*`.
- Server akzeptiert eine Op nur, wenn `baseRev` der aktuellen `rev` entspricht (optimistische Nebenläufigkeit).
- Reihenfolge eines Sync-Laufs: Push (Outbox, Vorlagen vor Einträgen) → Konflikte auflösen → Pull bis `hasMore = false`.
- Auslöser: nach jedem lokalen Speichern (debounced 1 s), App-Start, `visibilitychange` → sichtbar, `online`.
  Sync läuft nie parallel zu sich selbst.
- Backoff bei Fehlern: exponentiell (1 s … 5 min), sichtbarer Status im UI (Synchronisiert / Ausstehend n / Fehler).

## Konfliktauflösung (clientseitig, deterministisch)

Der Server kann nicht vergleichen (Chiffretext). Bei `conflict` entschlüsselt der Client beide Versionen:

| Kind | Regel |
|---|---|
| `entry` | **Merge pro Block-ID**: Werte, die nur auf einer Seite geändert wurden, werden übernommen. Wurde derselbe Block auf beiden Seiten geändert, gewinnt der höhere HLC; der unterlegene Wert wird in `ConflictLog` gespeichert (für den Nutzer einsehbar). Tags: Vereinigung. `deleted` gewinnt nur, wenn sein HLC höher ist. |
| `template` | Felder einzeln per HLC (Name, Icon, Farbe, Order, currentVersion = max). |
| `templateVersion` | Unveränderlich — gleiche ID mit anderem Inhalt ist ein Fehler; neue Versionen kollidieren nicht (Version n+1 auf zwei Geräten → spätere wird als n+2 neu angelegt). |
| `dashboard`, `savedFilter`, `diary` | Ganzer Datensatz per HLC, Verlierer in `ConflictLog`. |

Das Ergebnis wird mit `baseRev = server.rev` erneut gepusht.

**Kollidierende Vorlagenversion:** Lehnt der Server `templateVersion` n ab und ist der Inhalt anders, übernimmt der Client die Serverversion als n, legt seine eigene als nächste freie Nummer (max. aller bekannten Versionen + 1, typisch n+2) neu an, schreibt alle Einträge dieser Vorlage mit Version n **und ausstehender Op** auf die neue Nummer um (neuer HLC) und setzt `currentVersion` entsprechend. Alles in einer Dexie-Transaktion. Ein Push-Lauf schickt Einträge erst, nachdem die Strukturdaten (`diary`, `template`, `templateVersion`) ohne offene Kollision durch sind.

Für den 3-Wege-Merge hält der Client die zuletzt synchronisierte Version jedes Records (`base`) lokal vor
(über den PayloadCodec, 02). Verschlüsselung mit dem DK erfolgt in der Sync-Engine unmittelbar vor dem Push,
Entschlüsselung unmittelbar nach dem Pull.

Geteilte Tagebücher (09) synchronisieren über dieselben Endpunkte; der Server prüft pro Op die Mitgliedschaft und
Rolle (`viewer` darf nicht pushen).

## Offline

- Jede Funktion zum Erfassen/Bearbeiten/Löschen funktioniert offline vollständig.
- Wetter für offline erfasste Einträge wird nachgetragen, sobald online (Archiv-API, siehe 05).
- Der Service Worker liefert die App-Shell offline: Navigation **network-first** mit Cache-Fallback,
  gehashte Assets cache-first, `/api/*` nie gecacht. Update: neuer SW → Hinweis „Neue Version" → Neustart-Button
  (lädt nach Aktivierung automatisch neu).

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| SYN-01 | Offline erstellter Eintrag landet in der Outbox und wird nach `online` automatisch gepusht. | integration |
| SYN-02 | Mehrere Änderungen am selben Record ergeben genau eine Outbox-Op mit der ältesten `baseRev`. | unit |
| SYN-03 | Server lehnt Op mit veralteter `baseRev` als `conflict` ab und liefert die Serverversion. | integration |
| SYN-04 | Entry-Merge: disjunkte Blockänderungen auf zwei Geräten werden beide übernommen. | unit |
| SYN-05 | Entry-Merge: gleicher Block auf beiden Geräten geändert → höherer HLC gewinnt, Verlierer steht im ConflictLog. | unit |
| SYN-06 | Zwei Geräte (zwei Browser-Kontexte) bearbeiten offline, gehen online → beide konvergieren auf identischen Zustand. | e2e |
| SYN-07 | Pull paginiert korrekt über > 1.000 Records; Cursor wird erst nach erfolgreichem Anwenden gespeichert. | integration |
| SYN-08 | Abbruch mitten im Pull (Netzwerkfehler) führt nicht zu Datenverlust oder übersprungenen Records. | integration |
| SYN-09 | Sync-Antworten tragen `Cache-Control: no-store`; der Service Worker beantwortet keine `/api/*`-Anfrage aus dem Cache. | e2e |
| SYN-10 | `local-only`: es findet keinerlei Request an den Sync-Server statt (Netzwerk-Mitschnitt im E2E-Test). | e2e |
| SYN-11 | Wechsel `local-only → cloud-primary` lädt alle Records hoch; zweites Gerät sieht danach alle Daten. | e2e |
| SYN-12 | Wechsel `cloud-primary → local-only` ist blockiert, solange die Outbox nicht leer ist. | integration |
| SYN-13 | Sync läuft nie parallel: gleichzeitige Auslöser führen zu genau einem Lauf + höchstens einem Folgelauf. | unit |
| SYN-14 | Sync-Status (synchronisiert / ausstehend n / Fehler) ist im UI sichtbar und korrekt. | e2e |
| SYN-15 | App-Shell lädt offline; nach Deploy einer neuen Version erscheint der Update-Hinweis, Neustart aktiviert sie. | e2e |
| SYN-16 | Gelöschte Records (Tombstones) werden synchronisiert und auf dem Zweitgerät ausgeblendet. | integration |
| SYN-17 | `planVersionRenumber`: lokale Vorlagenversion, die mit einer Serverversion gleicher Nummer kollidiert, erhält die nächste freie Nummer (max. aller bekannten Versionen + 1); umgeschrieben werden genau die Einträge dieser Vorlage mit dieser Version und ausstehender Outbox-Op (neuer HLC, Werte unverändert); `currentVersion` zeigt auf die neue Nummer, wenn die lokale Version die aktuelle war. | unit |
| SYN-18 | Zwei Geräte legen offline Version n+1 derselben Vorlage an und tragen damit ein; nach dem Sync beider Geräte existieren n+1 (erstes Gerät) und n+2 (zweites Gerät), keine Op bleibt mit `templateVersion-collision` stehen, beide Geräte haben denselben Stand und jeder Eintrag ist gegen seine Version gültig. | integration |
| SYN-19 | Sync von `dashboard`-Records (06): Reihenfolge nach Vorlagen, Konflikt per HLC (ganzer Datensatz), Push eines Editors → 403. | unit |
