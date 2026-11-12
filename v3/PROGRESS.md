# PROGRESS — laufender Stand v3

> Wird vom Loop gepflegt (siehe [LOOP.md](LOOP.md)). Manuelle Kriterien hakt **nur der User** ab.

## Aktuell

- **Meilenstein:** M7 — UI-Grundgerüst, Onboarding, Entsperren (Gate G1 freigegeben)
- **Nächste Aufgabe:** SYN-15 — Service Worker (eigenes `sw.ts`, Version aus `version.ts`): App-Shell offline (Navigation
  network-first mit Cache-Fallback, gehashte Assets cache-first, `/api/*` nie), Update-Hinweis bei wartendem SW mit
  Neustart-Button. E2E: offline laden; neue Version deployen (Build mit anderer Version) → Hinweis → Neustart aktiviert.
  Danach M7 abschließen.
- **Erledigt in M7:** UI-01 UI-07 UI-03 UI-06 CRY-11 CRY-12 CRY-08 CRY-09 CRY-10 CRY-16 SYN-10 UI-04 UI-05
- **Hinweis Ablauf:** `npm run verify` + `npm run test:e2e` vor `npm run acceptance` (Playwright-Report wird nur von test:e2e erzeugt).
- **Blocker:** keine. (QA-08 wartet auf funktionierendes Docker Desktop → dann `npm run verify:docker`.)
- **Offen für M8:** Umnummerierung kollidierender Vorlagenversionen auf n+2 (A-016).
- **Blocker:** keine

## Meilensteine

| M | Status | Notiz |
|---|---|---|
| M0 | erledigt | 7/7 IDs |
| M1 | erledigt | 14/14 IDs |
| M2 | erledigt | 7/7 IDs |
| M3 | erledigt | 6/6 IDs |
| M4 | erledigt | 12/12 IDs |
| M5 | erledigt | 10/10 IDs, Konfliktpfad nachgearbeitet |
| M6 | erledigt | 12/12 IDs → Gate G1 |
| M7 | in Arbeit | 13/14 IDs |
| M8 | offen | danach Gate G2 |
| M9 | offen | erst nach UI-11 |
| M10 | offen | |
| M11 | offen | danach Gate G3 |
| M12 | offen | erst nach UI-12 |
| M13 | offen | danach Gate G4 |

## Manuelle Kriterien und Gates (vom User abzuhaken)

### G1 — Wireframes
- [x] UI-10 Wireframes in `v3/design/` durchgesehen und freigegeben (User im Chat: „g1 freigegeben“, 2026-11-12)

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

- 2026-11-12 (nach M4-Stopp): Docker Desktop gestartet. A-010: v2-Datum-Block diente zum **Nachtragen** und für
  **Zeiträume** → umgesetzt als Zeitangabe des Eintrags (`occurredAt` + optionales `period`), Specs 02/05/11 + BLK-19 (M8).
  Übrige offene Annahmen A-008–A-013 vom User an den Loop delegiert (als entschieden markiert).

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
| 2026-11-12 | Feedback | (DM-03 erweitert) | `entryPeriodSchema` (ganztägig oder mit Uhrzeiten, Ende ≥ Beginn) als `Entry.period`; Specs 02/05/11, MILESTONES (BLK-19 → M8), A-010 überarbeitet, A-008–A-013 entschieden, A-014 gelöst. |
| 2026-11-12 | M4.9 | QA-08 | Docker läuft: Server-Image scheiterte an `node-gyp` (npm 10 im Image kennt `allowScripts` nicht) → `npm ci --ignore-scripts` (A-012), `linuxmusl`-Prebuild wird geladen. `docker compose up` → Health über nginx mit Version. Test läuft bei jedem `verify` (mit Cache ~20 s). **M4 fertig.** |
| 2026-11-12 | M5.1 | SYN-04 SYN-05 | `core/hlc.ts` (Format A-015, `tick`/`receive` monoton, Vergleich), `core/canonical.ts` (aus templates.ts ausgelagert, `deepEqual`). `sync-protocol/merge.ts` `mergeEntry(base, local, remote)`: 3-Wege pro Block-ID, Tags-Vereinigung, `deleted` nur mit höherem HLC, Konflikte als `MergeConflict` (Engine legt daraus ConflictLog-Records an). |
| 2026-11-12 | M5.2 | SYN-02 SYN-13 | Test für bestehende Outbox-Kompaktierung (eine Op pro Record, älteste `baseRev`, delete ersetzt upsert). `web/sync/single-flight.ts`: ein Lauf + höchstens ein Folgelauf, Fehler blockieren nicht. |
| 2026-11-12 | M5.3 | DM-13 SYN-01 | `web/sync/transport.ts` (Interface + fetch-Transport), `web/sync/engine.ts` Push: Outbox nach Kind (diary/template/templateVersion zuerst), DK-Verschlüsselung mit AAD, Batches ≤ 500, `applied` → `rev` + `base` = gepushter Snapshot, Op nur löschen wenn unverändert (sonst `baseRev` nachziehen); Auslöser `online`/`visibilitychange` über Single-Flight. Neuer Ordner `integration/` (echter Server per inject + Web-Datenschicht), da apps einander nicht importieren dürfen. Hinweis: `integration/` wird gelintet, aber (wie alle Tests) nicht typgeprüft. |
| 2026-11-12 | M5.4 | SYN-07 SYN-08 SYN-16 | Engine `pullDiary`: Seiten (≤ 500) außerhalb der Transaktion entschlüsseln/kodieren, dann Records + Cursor (`sync_state`) gemeinsam schreiben; Records mit ausstehender Op werden nicht überschrieben (Konflikt beim nächsten Push). `sync()` = Push → Pull je Tagebuch. Tests: 1.100 Records über 3 Seiten, Abbruch beim Anwenden und beim Netz, Tombstones. |
| 2026-11-12 | M5.5 | SYN-12 | `web/sync/mode.ts`: `switchToLocalOnly` (erst vollständiger Pull, dann leere Outbox prüfen → sonst `outbox-not-empty`/`server-unreachable`), `switchToCloudPrimary` (alle lokalen Records in die Outbox, Erst-Push), `getSyncMode` (Standard local-only). **M5 Akzeptanz OK**; Konfliktpfad der Engine als Nacharbeit vor M6 eingeplant. |
| 2026-11-12 | M5.6 | (SYN-04 SYN-05 Integration) | Konfliktpfad: `web/sync/resolve.ts` (entry → `mergeEntry`; template feldweise; sonst ganzer Datensatz; templateVersion-Kollision → nicht auflösbar), Engine löst Konflikte nach Push auf (Server entschlüsseln, `base` = Serverstand, `baseRev = server.rev`, ConflictLog lokal), bis zu 3 Runden; identisches Ergebnis → Serverstand übernehmen ohne Push. Zwei-Geräte-Tests konvergieren. A-016. |
| 2026-11-12 | M6.1 | SHR-03 SHR-04 | `@stb/crypto/invitation.ts`: Einladungs-Secret (128 Bit), HKDF → AES-GCM (Chiffretext Name/Rolle) und HMAC (Bindung identityPub), Sicherheitsnummer (SHA-256 über `stb/v3/fingerprint` + sortierte Keys → 12×5 Ziffern aus je 20 Bit), `updateVerification` (Key-Wechsel → nicht mehr verifiziert + Hinweis). `web/sharing/invitations.ts` `confirmAcceptances`: nur bei gültiger HMAC DK-Wrap + Bestätigung. Integrationstest mit vom Server ausgetauschtem Key. |
| 2026-11-12 | M6.2 | SHR-11 VOI-01 | `web/sharing/leave.ts` (erst Server-Austritt, dann lokal Records/Outbox/sync_state/Schlüssel des Tagebuchs löschen). `web/intake/setup.ts` (ECDH-Paar, privater Schlüssel als JWK im `intakeKey`-Record, Server bekommt nur Public Key + SHA-256(Token), Token einmalig zurück). Spec-Widerspruch 08/09 (Editor + Intake) → A-017, Spec 09 präzisiert, Editor darf `intakeKey` pushen. |
| 2026-11-12 | M6.3 | VOI-06 VOI-08 | `core/intake.ts`: `normalizeLabel` (Groß/Klein, ä/ae/a, ß, Satzzeichen), `mapIntakeToValues` (Block-ID, Label, Options-Labels, Typkonvertierung + Blockschema-Prüfung, Rest + Freitext in ersten textarea-Block, sonst Tag „Kurzbefehl" + `note`, Fehler gesammelt), `buildShortcutPrompt` (JSON-Ziel mit ID/Typ/Bereich/Optionen). **Typ-Fix:** `BlockDef` war keine unterscheidbare Union (generischer Indexzugriff in `defFor`) — behoben; zuvor nur in (nicht typgeprüften) Tests genutzt. |
| 2026-11-12 | M6.4 | VOI-05 VOI-07 | Server: `GET /diaries/:id/intake-items`, `DELETE /intake-items/:id` (owner/editor). `web/intake/pickup.ts`: Siegel mit allen lokalen `intakeKey`s probieren, Body prüfen, Vorlage (templateId oder Schnelleintrag), `mapIntakeToValues`, Eintrag `source: 'shortcut'`; bei Problemen Record `intakeInbox` (synchronisiert, Editor darf pushen); Bestätigung erst nach lokaler Übernahme. Nicht entsiegelbare Items bleiben auf dem Server. |
| 2026-11-12 | M6.5 | BLK-11 BLK-12 BLK-14 BLK-17 | `web/weather/open-meteo.ts` (URL nur mit gerundetem Ort, Forecast ≤ 48 h sonst Archiv, Stundenwert + Δ-Luftdruck 24 h, A-018), `web/weather/service.ts` (`metaFor` über `resolveEntryWeather`, Geolocation-Adapter, `backfill` für `weatherPending`). Tests mit Mock-`fetch` und Geolocation-Spy. **M6 fertig.** |
| 2026-11-12 | G1-Vorbereitung | — | `v3/design/`: 11 klickbare Low-Fi-Seiten (Onboarding/Entsperren, Start+Eingang, Schnelleintrag, Eintrag mit Zeitpunkt/Zeitraum, Verlauf/Detail mit archiviertem Feld, Auswertung/Vergleich, Mehr, Vorlagen/Editor, Tagebücher/Teilen/Kurzbefehl, Export, Einstellungen/Konflikte/Diagnose), shadcn-Optik in reinem CSS, Hell/Dunkel. **Loop angehalten (Gate G1).** |
| 2026-11-12 | G1-Vorbereitung | — | `v3/design/`: 11 klickbare Low-Fi-Seiten (Onboarding/Entsperren, Start+Eingang, Schnelleintrag, Eintrag mit Zeitpunkt/Zeitraum, Verlauf/Detail mit archiviertem Feld, Auswertung/Vergleich, Mehr, Vorlagen/Editor, Tagebücher/Teilen/Kurzbefehl, Export, Einstellungen/Konflikte/Diagnose), shadcn-Optik in reinem CSS, Hell/Dunkel. **Loop angehalten (Gate G1).** |
| 2026-11-12 | Tooling | (QA-08) | Docker-Test nur noch mit `npm run verify:docker` (A-019, `scripts/run-with-env.mjs` setzt Env plattformunabhängig). Vor Meilenstein-Abschluss/Gates einmal ausführen. Parallel: Code-Review M4–M6 per `code-reviewer`-Subagent gestartet. |
| 2026-11-12 | Review M4–M6 | (Fixes) | `code-reviewer`-Subagent: 14 Befunde, alle im Code bestätigt und behoben. Server (d16e1fb): Intake an Mitgliedschaft des Erstellers, Editor nur eigene Keys, Rate-Limits nach Token-Prüfung + pro IP, Einladungsabruf rate-limited, Records-Schlüssel (diary_id, id) (Schema v6). Engine (7fd2771): Merge überschreibt keine parallelen Änderungen, Quarantäne statt Pull-Blockade, Fehler pro Tagebuch isoliert, HLC receive/tick, Tombstone mit frischem HLC, Modus bleibt erhalten. Intake: Text ohne Notizfeld → Eingang, deterministische IDs gegen Duplikate, Autor = Ersteller (A-020). Je Befund Regressionstest. |
| 2026-11-12 | Gate G1 | UI-10 | Vom User freigegeben („g1 freigegeben“), kein Änderungsfeedback zu den Wireframes. M7 beginnt. |
| 2026-11-12 | M7.1 | UI-01 UI-07 | `apps/web` als Vite 7 + React 19 + Tailwind 4 + shadcn/ui (Button, `cn`, Tokens hell/dunkel in `index.css`), `i18n/de.ts`, `@/`-Alias, tsc-Ausgabe nach `.tsbuild/`. Vite fand die PostCSS-Config von v2 im Repo-Root → explizit leere PostCSS-Config. ESLint: Basis-Elemente/`style` nur in `components/ui/` (UI-01), JSX-Text/Text-Attribute in components/pages nur aus i18n (UI-07); `check-ui-css.mjs` in `lint`. `check-deps` erlaubt mehrere Pakete pro DECISIONS-Zeile. Initiales JS 69,6 KB gzip. |
| 2026-11-12 | M7.2 | UI-03 UI-06 | React Router 7 (Library-Modus), `AppShell` mit unterer Navigation (4 Ziele, ≥ 44 px), Seitenkopf mit Zurück (Historie), Ansichten-Gerüst laut Wireframes, Leer-/Fehlerzustand-Komponenten (shadcn Card), Theme `system|light|dark` (localStorage, `.dark`). Playwright 1.65 (Chromium + WebKit, 375 px), `npm run test:e2e` → `reports/playwright.json`. Initiales JS 115,8 KB gzip. |
| 2026-11-12 | M7.3 | CRY-11 CRY-12 | `web/auth/errors.ts`: 9 Fehlercodes mit je eigenem Text (`de.authErrors`, Snapshots), `toAuthErrorCode` (DOMException/Netz/Krypto → Code, `unwrap-failed` je Faktor → wrong-password/wrong-backup-code). `web/data/crypto-session.ts`: UMK/DKs nur im Speicher, `keys` als DiaryKeyProvider, „entsperrt bleiben" per nicht-extrahierbarem AES-KW-Device-Key (IndexedDB), Ablauf 7 Tage (einstellbar), Widerruf. Vitest-Alias `@` → apps/web/src. |
| 2026-11-12 | M7.4 | (Grundlage CRY-08/09/16) | `web/auth/local-account.ts` (Konto local-only: UMK + Wraps für Faktor und Pflicht-Backup-Code, Entsperren, Recovery ersetzt Faktor + Code), `web/auth/passkey.ts` (PRF mit festem Eval-Salt, Optionen vorab, `credentials.get` synchron im Handler, PRF-Nachholen bei `get`). Tests bewusst ohne M7-IDs, bis die E2E-Kriterien mit UI erfüllt sind. |
| 2026-11-12 | M7.5 | CRY-08 CRY-09 CRY-10 CRY-16 SYN-10 UI-04 UI-05 | Onboarding (Install → Modus → Passkey/Passwort → Backup-Code mit Pflichtbestätigung; Konto erst nach Bestätigung gespeichert: `prepareLocalAccount`/`prepareRecovery` + `commit`), Entsperren (Passkey-Optionen beim Öffnen, Klick ruft `credentials.get` synchron; Passwort; „entsperrt bleiben"), Recovery (neuer Zugang + neuer Code), `AuthProvider` (Status no-account/locked/unlocked, memoisiert), Sperr-Banner, gesperrte Ansichten, Einstellungen → Entsperren/Sperren. shadcn Input/Label/Checkbox ohne Radix. Modus „Mit Konto" im Onboarding sichtbar, aber deaktiviert („folgt", M8). E2E: virtueller Authenticator mit PRF (Chromium/CDP), Passwort-Varianten in Chromium + WebKit; In-App-Navigation per History (Neuladen sperrt korrekt). Playwright 2 Worker (WebKit/Windows instabil bei 6). |
| 2026-11-12 | M7.6 | UI-04 UI-05 | `DataProvider` (Repositories über der Konto-DB, local-only ohne Outbox), `useQuery` (Laden/ok/Fehler + retry), Start/Verlauf/Auswertung laden Einträge (`listAllEntries`), `EntryListState`. Deep-Links behalten Hash (`/invite#…`); Entsperr-Links ersetzen den gesperrten Historieneintrag. E2E: Deep-Links nach Entsperren + Zurück; Leerzustand mit leerer DB; Fehlerzustand per IndexedDB-Patch nur im Test (`records`-Store). |
