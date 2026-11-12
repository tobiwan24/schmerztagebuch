# PROGRESS — laufender Stand v3

> Wird vom Loop gepflegt (siehe [LOOP.md](LOOP.md)). Manuelle Kriterien hakt **nur der User** ab.

## Aktuell

- **Meilenstein:** M4 — Server: Auth, Records, Mitglieder, Intake
- **Nächste Aufgabe:** QA-08 grün bekommen (Docker-Daemon nötig), dann M4 abschließen und M5 (Sync-Engine) beginnen.
- **Erledigt in M4:** ARC-04 SYN-03 SHR-05 SHR-06 SHR-07 SHR-08 CRY-13 CRY-14 VOI-03 VOI-04 VOI-10
- **Blocker:** QA-08 — Docker-Daemon nicht erreichbar (DECISIONS A-014, Entscheidung des Users: Docker starten oder QA-08 nach M13 verschieben).

## Meilensteine

| M | Status | Notiz |
|---|---|---|
| M0 | erledigt | 7/7 IDs |
| M1 | erledigt | 14/14 IDs |
| M2 | erledigt | 7/7 IDs |
| M3 | erledigt | 6/6 IDs |
| M4 | in Arbeit | 11/12 IDs |
| M5 | offen | |
| M6 | offen | danach Gate G1 |
| M7 | offen | erst nach UI-10 |
| M8 | offen | danach Gate G2 |
| M9 | offen | erst nach UI-11 |
| M10 | offen | |
| M11 | offen | danach Gate G3 |
| M12 | offen | erst nach UI-12 |
| M13 | offen | danach Gate G4 |

## Manuelle Kriterien und Gates (vom User abzuhaken)

### G1 — Wireframes
- [ ] UI-10 Wireframes in `v3/design/` durchgesehen und freigegeben

### G2 — Kernablauf
- [ ] UI-11 Kernablauf auf dem iPhone durchgeklickt und freigegeben
- [ ] CRY-17 Passkey-Login auf echtem iPhone (Face ID, iCloud-Schlüsselbund) inkl. App-Neustart

### G3 — Auswertung & Export
- [ ] UI-12 Auswertung und Export mit echten Daten freigegeben
- [ ] ANA-16 Diagramme per Touch bedienbar
- [ ] EXP-13 PDF eines Monats für den Arzttermin brauchbar

### G4 — Ablösung
- [ ] UI-13 Freigabe zur Umstellung des Deployments
- [ ] MIG-16 Migration der echten Daten auf dem Hauptgerät, Stichprobe bestätigt
- [ ] VOI-11 Echter Kurzbefehl auf dem iPhone erzeugt Eintrag
- [ ] SHR-12 Einladung an zweites iPhone angenommen, beide tragen ein

### Ablösungs-Checkliste (Spec 11)
- [ ] Letzter v2-Sync auf jedem Gerät
- [ ] v2-Backup-Datei exportiert und extern gesichert
- [ ] Migration in Vorschau-Umgebung mit Datenkopie fehlerfrei
- [ ] v3-Server im Homelab inkl. Backup
- [ ] Deployment umgestellt, Hauptgerät migriert, weitere Geräte angemeldet
- [ ] v2-Server nach 30 Tagen abgeschaltet

## Gate-Feedback (vom User, vor dem nächsten Meilenstein umzusetzen)

_noch keins_

## Log

| Datum | Iteration | IDs | Notiz |
|---|---|---|---|
| 2026-11-12 | Specs | — | Specs 00–12, MILESTONES, LOOP, DECISIONS, check-acceptance.mjs erstellt (162 IDs, Struktur ok) |
| 2026-11-12 | M0.1 | ARC-02 ARC-03 ARC-05 ARC-06 QA-06 QA-11 | Workspaces, tsconfig.base (strict), ESLint-Abhängigkeitsregeln (A-008: Kernregeln statt `import/no-restricted-paths`), Vitest-JSON-Report, `check-deps.mjs` (in `verify`), `@stb/core`-Skelett mit `Clock`/`Random`. Node 26 lokal; esbuild-Postinstall von npm `allow-scripts` nicht ausgeführt, Vitest läuft trotzdem. |
| 2026-11-12 | M0.2 | ARC-01 | Test kopiert Checkout-Stand (`git ls-files -co --exclude-standard`) in Temp, `npm ci` + `verify` (~10 s). Deckte Bug auf: `reports/` in `.gitignore` ignorierte `fixtures/acceptance/reports/` → auf `/reports/` verankert. **M0 fertig.** |
| 2026-11-12 | M1.1 | DM-01 DM-02 | `createIdGenerator(clock, random?)` → `{ newId }` (12-Bit-Zähler, Uhr-Rücksprung sicher), `idTimestamp`, `isUuidV7`; `cryptoRandom` als Standard. `Clock` ist Pflicht (keine Systemuhr in `packages/*`, QA-06) — Apps reichen die Uhr herein. |
| 2026-11-12 | M1.2 | DM-04 DM-05 | `core/fractional-index.ts`: eigene Basis-62-Implementierung (keine Abhängigkeit), `keyBetween`, `compareByOrder` (Order, dann ID, Code-Unit-Vergleich ohne Locale). |
| 2026-11-12 | M1.3 | BLK-01 BLK-04 DM-11 | zod 4 (DECISIONS). `core/blocks/<typ>.ts` je Typ: `config`, `value(config)`, `emptyValue`, `isEmpty`, `toDisplay`; `parseBlockConfig`/`parseBlockValue`. Alle Unter-IDs UUID v7. `toAnalysis`/`toCsv` folgen. Hinweis: `npm install <pkg> -w <ws>` crasht (npm 11.16, „reading 'location'") → Abhängigkeit in Workspace-`package.json` eintragen und Root-`npm install`. |
| 2026-11-12 | M1.4 | DM-03 DM-06 DM-07 | `core/templates.ts`: Schemas für BlockDef/Template/TemplateVersion/Entry/Weather, `createTemplate`, `updateTemplate` (Strukturvergleich kanonisch, nach Block-ID sortiert; Block-Reihenfolge zählt als Struktur, vgl. BLK-06), Typwechsel-Sperre auch gegen frühere Versionen (`history`). `entrySchemaFor(version)` prüft Block-IDs + Werte; Pflichtfelder bewusst nicht im Schema (Schnelleintrag, BLK-07 im Formular). |
| 2026-11-12 | M1.5 | BLK-02 | `AnalysisValue` (numeric/event/options/text/textEvents/time/points) + `toAnalysis` je Blockmodul, `analyzeBlockValue` liefert `null` für leere Werte (zählen nicht in `n`). Body-Map-Regionen erst nach Portierung der v2-Presets. |
| 2026-11-12 | M1.6 | BLK-13 BLK-18 | `core/weather.ts`: `planWeather`, `needsWeatherRefetch` (> 1 h), `roundLocation`, `resolveEntryWeather` mit injizierten `fetchWeather`/`currentPosition` (Apps liefern Open-Meteo/Geolocation in M6). GPS-Rückfall als A-009 notiert. |
| 2026-11-12 | M1.7 | BLK-16 | `core/catalog.ts`: 4 v2-Katalogvorlagen portiert (IDs/Namen/Icons gleich, Rollen ergänzt, Datum-Block entfällt → A-010), `instantiateCatalogTemplate`. Test gegen Snapshot `fixtures/v2/template-catalog.json` (v2-Quelle liegt außerhalb von `v3/`, daher Snapshot). **M1 fertig.** |
| 2026-11-12 | M2.1 | CRY-01 CRY-02 CRY-03 | `packages/crypto` angelegt (nur WebCrypto, `lib: DOM` nur für Typen). `envelope.ts` (Format + AAD laut Spec 03, `|` in AAD-Feldern verboten), eigenes base64url, `CryptoError` mit Codes, `domains.ts`. |
| 2026-11-12 | M2.2 | CRY-04 CRY-06 | `umk.ts`: `generateUmk`, `deriveKek` (PRF→HKDF; Backup/Passwort→PBKDF2 600k→HKDF, je eigene `info`), `wrapUmk`/`unwrapUmk` (AES-KW, `UmkWrap {v,factor,salt,wrapped}`), falscher/fremder Faktor → `unwrap-failed`. Apps bilden `unwrap-failed` je Faktor auf `wrong-password`/`wrong-backup-code` ab. `normalizeBackupCode` vorgezogen. |
| 2026-11-12 | M2.3 | CRY-05 CRY-07 | `share.ts`: ECDH P-256 ephemer-statisch → HKDF (info `dk-wrap/ecdh|diaryId|keyEpoch`, salt `epk‖recipientPub`) → AES-KW. `backup-code.ts`: 128 Bit + 32-Bit-Prüfsumme, Base32 4×8 (A-011), tolerante Prüfung. **M2 fertig.** |
| 2026-11-12 | M3.1 | DM-10 DM-12 | `apps/web` (nur `src/data`, keine Ansichten): Dexie `stb-v3` v1 laut Spec 02, `PayloadCodec` (`plain`, `aes` über `@stb/crypto`), Codec-Registry, generisches Record-Repository (validieren+kodieren vor der Transaktion, Record+Outbox atomar, eine Op pro Record mit ältester `baseRev`, `local-only` ohne Outbox, Soft-Delete). Neue Deps dexie, fake-indexeddb. Vitest-Alias `@stb/*` → `src`. |
| 2026-11-12 | M3.2 | DM-08 DM-09 BLK-06 | `core/entry-view.ts` (`resolveEntryView`: aktuelle Blöcke nach Order, archivierte Felder mit Wert hinten). `web/data/repositories/diary.ts` (Vorlage+Version atomar via `putMany`, Eintrag gegen seine Version validiert, `getEntryView`). Record-ID einer Version deterministisch `<templateId>.v<n>` (passt zu Spec 04: gleiche ID mit anderem Inhalt = Fehler). Repository-Tests laufen mit `plain` und `aes`. |
| 2026-11-12 | M3.3 | BLK-08 | Perf-Test `diary.perf.test.ts`: Katalogvorlage `headache`, 50× `saveEntry` (zod + Codec + Record + Outbox) auf fake-indexeddb, Median < 100 ms. **M3 fertig.** |
| 2026-11-12 | M4.1 | ARC-04 | `apps/server`: Fastify 5, better-sqlite3 13, zod-Config (`loadConfig` meldet alle fehlenden Variablen), `.env.example`, `startServer`, Health `GET /api/v1/health`. ARC-01 deckte auf: `npm ci` baut better-sqlite3 per node-gyp (scheitert ohne Windows SDK) → Install-Skript per `allowScripts` verweigert, mitgelieferte Prebuilds werden genutzt (A-012). |
| 2026-11-12 | M4.2 | SYN-03 | Neues Paket `@stb/sync-protocol` (zod-DTOs Push/Pull, Limits 500). Server: Schema-Migrationen über `user_version` (diaries, memberships, records, sync_counter), `applyPush` (rev-Prüfung je Op in einer Transaktion, fremdes Tagebuch → conflict ohne Inhalt), `pull` (seq-Cursor, `hasMore`), `Cache-Control: no-store`. Austauschbares `AuthProvider`: Tests `headerAuth`, Server bis CRY-13 `noAuth` (alles 401). |
| 2026-11-12 | M4.3 | SHR-05 SHR-06 SHR-07 | `members/service.ts`: `mayPushKind` (editor: entry/attachmentMeta, A-013), `changeRole`/`revokeMember` mit Letzter-Owner-Schutz (409 `last-owner`) in Transaktionen. Routen PATCH/DELETE `/diaries/:id/members/:principalId`; Push prüft Rolle je Op (eine verbotene → ganzer Push 403). |
| 2026-11-12 | M4.4 | SHR-08 | Migration 2 `invitations` (+ role, accepted_by, identity_pub, mac, confirmed_at, revoked_at). Endpunkte laut Spec 09 + `GET /diaries/:id/invitations` (angenommene, unbestätigte für den Owner-Client — nötig für den Ablauf, in Spec 09 nicht aufgeführt). Einladung: 7 Tage, einmalig, widerrufbar (410 `gone`); Bestätigung legt Mitgliedschaft mit `key_epoch` des Owners an. Rate-Limit für den öffentlichen Abruf folgt (VOI-10-Infrastruktur). |
| 2026-11-12 | M4.5 | CRY-13 | Migration 3 `challenges`; `createChallenge` (32 Byte base64url, TTL 5 min, räumt Abgelaufene auf), `consumeChallenge` (atomar `DELETE … RETURNING`, an Zweck gebunden, einmalig; unbekannt/abgelaufen → `challenge-expired`). WebAuthn-Verifikation (`@simplewebauthn/server`) folgt mit den Login-IDs in M7. |
| 2026-11-12 | M4.6 | CRY-14 | Migration 4 `users`/`devices`/`sessions` (nur Token-Hash). `sessionAuth` (Cookie `stb_session`, prüft Ablauf + `devices.revoked_at`, beendet ungültige Sitzungen), `createSession` (HttpOnly/Secure/SameSite=Strict, 30 Tage), `DELETE /devices/:id` (nur eigene Geräte, löscht alle Sitzungen). Server nutzt jetzt `sessionAuth` statt `noAuth`; Sitzungen entstehen ab M7 nach WebAuthn-Login. Rotation des Cookies folgt mit dem Login. |
| 2026-11-12 | M4.7 | VOI-03 VOI-04 VOI-10 | `@stb/crypto` `sealForIntake`/`unsealIntake` (ECDH ephemer → HKDF `stb/v3/intake` → AES-GCM, AAD mit diaryId). Migration 5 `intake_keys`/`intake_items`. `POST /intake/:diaryId` (Bearer-Token → SHA-256, Route-`bodyLimit` 16 KB → 413, zod-Form → 400, sofort versiegeln, 202), Schlüssel anlegen/widerrufen (owner/editor). Generischer In-Memory-Rate-Limiter (gleitendes Fenster) 60/h pro Token → 429 + Retry-After. Optionaler `logStream`: Test belegt, dass Log und DB weder Klartext noch Token enthalten. |
| 2026-11-12 | M4.8 | (QA-08 vorbereitet) | `apps/server/Dockerfile` (node:22-alpine, Prebuild statt node-gyp, User `node`), `apps/web/Dockerfile` (nginx, Platzhalterseite bis M7, `/api` → Server, no-store), `docker-compose.yml`, `.dockerignore`, Test `scripts/docker-compose.test.mjs` (nur mit Daemon; Projekt `stb-v3-qa08`, Port 18080). Daemon nicht erreichbar → Test übersprungen, QA-08 offen → **Loop angehalten** (A-014). |
