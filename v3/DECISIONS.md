# DECISIONS — Entscheidungslog v3

Format: `ADR-NNN` = getroffene Entscheidung. `A-NNN` = offene Annahme, die der User bestätigen oder ändern soll.
Der Loop ergänzt hier neue Annahmen und jede neue npm-Abhängigkeit.

## Entscheidungen (vom User am 2026-11-12 getroffen)

| ID | Entscheidung | Folge in den Specs |
|---|---|---|
| ADR-001 | v3 als Neuaufbau in `v3/`, Branch `feat/v3` von `develop`, Merge nach `develop`. `main` wird nie angefasst. Keine v2-Hotfixes. | 00, LOOP |
| ADR-002 | Scope-Schnitt v3.0 (MVP, ersetzt v2) / v3.x. | 00 (Stufen-Tabelle), Backlog-Abschnitte |
| ADR-003 | Geteilte Tagebücher **in v3.0** (eine zweite Person trägt ein): Einladung, Rollen, DK pro Mitglied, Fingerprint. DK-Rotation → v3.x. | 03, 09 |
| ADR-004 | Lokal (IndexedDB) in v3.0 unverschlüsselt, aber über `PayloadCodec` nachrüstbar. Server und Backups immer E2E. | 02, 03 |
| ADR-005 | Wetter: fester Ort pro Tagebuch, GPS optional pro Eintrag. | 02, 05 |
| ADR-006 | Gleiche Adresse wie v2; v3 liest `PainDiaryDB` direkt. | 01, 11 |
| ADR-007 | v2 nutzt nur der User, inkl. v2-Cloud-Sync → Migration mit v2-Server-Pull. | 11 |
| ADR-008 | LLM, MCP, API, Arzt-Link, Dashboard-Baukasten, erweiterte Analysen → v3.x. Analysen in v3.0 rein beschreibend. In-App-Interview gestrichen. | 06, 07, 08 |
| ADR-009 | Loop darf npm-Abhängigkeiten hinzufügen (mit Eintrag hier) und auf `feat/v3` committen, nie pushen. UI mit Human-Gates G1–G4. | LOOP, 10, 12 |
| ADR-010 | v2-Roadmap RDM-005/006/010/011/018 → v3.x (RDM-010 Custom-Zeitraum ist in 06 ohnehin enthalten). | 00, 05, 06, 10 |
| ADR-011 | Name bleibt „Schmerztagebuch". | — |

## Offene Annahmen (bitte bestätigen oder ändern)

| ID | Annahme | Warum | Status |
|---|---|---|---|
| A-001 | **Kurzbefehl-Intake über den eigenen Server**: Klartext liegt kurz im Server-RAM und wird sofort mit dem Intake-Public-Key versiegelt (08). | Kurzbefehle können weder AES/ECDH rechnen noch die installierte PWA mit Daten öffnen. Einzige Alternative ohne Server-Klartext ist der Zwischenablage-Weg (ist zusätzlich vorgesehen). | offen |
| A-002 | Rolle `editor` darf Einträge, aber **keine Vorlagen** bearbeiten. | Einfaches Rechtemodell; Vorlagenänderungen betreffen Auswertungen. | offen |
| A-003 | Volles Tutorial aus v2 → v3.x; v3.0 nutzt Leerzustände mit Hinweisen. | Aufwand; Tutorial hängt stark am finalen UI. | offen |
| A-004 | v3 legt **neue** Passkeys an; v2-Passkeys nur für die Migration. | Neuer Server, neues Schlüsselmodell (UMK statt DEK). | offen |
| A-005 | Routing mit React Router (v2 hatte manuelles View-State-Routing). | Deep-Links (`/quick`, `/invite`) und Zurück-Geste. | offen |
| A-006 | Migrierte Einträge landen im Tagebuch „Ich"; Wetter wird nicht automatisch nachgetragen (Schalter vorhanden). | Viele Archiv-Requests, Ort früherer Einträge unbekannt. | offen |
| A-007 | Exporte entstehen nur auf dem Gerät; es gibt keinen serverseitigen PDF-Export. | E2E. | offen |
| A-008 | Abhängigkeitsregeln (Spec 01) werden mit den ESLint-Kernregeln `no-restricted-imports` (Paketnamen `@stb/*`, `react`, `dexie`, …, Pfadmuster `**/apps/<app>/**`, `**/data/db*`) und `no-restricted-properties`/`no-restricted-globals` umgesetzt statt mit `import/no-restricted-paths`. | Pakete importieren einander über Workspace-Namen, nicht über Pfade; `no-restricted-paths` bräuchte zusätzlich Plugin + TS-Resolver. Wirkung laut ARC-02/03 identisch; Umstieg auf das Plugin ist jederzeit möglich. | entschieden (Loop, vom User delegiert 2026-11-12) |
| A-009 | GPS-Schalter aktiv, aber Standort nicht verfügbar (verweigert/Fehler) → Rückfall auf den festen Ort des Tagebuchs (`origin: 'diary'`); ohne festen Ort wird kein Wetter ermittelt und **kein** `weatherPending` gesetzt. | Spec 05 regelt den Fall nicht; ohne Ort kann der spätere Nachtrag nichts abfragen. Änderbar in `core/weather.ts` `resolveEntryWeather`. | entschieden (Loop, vom User delegiert 2026-11-12) |
| A-010 | v2-Pflicht-Block „Datum" wird kein v3-Block, sondern eine **Zeitangabe des Eintrags**: Umschalter Zeitpunkt/Zeitraum wie in v2. Zeitpunkt = `occurredAt` (änderbar, auch zum Nachtragen), Zeitraum = `period {start,end}` (ganztägig oder mit Uhrzeiten), `occurredAt` = Beginn. Migration: v2 `single` → `occurredAt`, `range` → `period`. Katalog-Rollen: Schmerzstärke=`outcome`, Notizen=`note`; Body-Map-Standard = v2-Preset `default-koerper-vorderseite`. | User-Feedback 2026-11-12: Datum-Block diente zum Nachtragen und für Zeiträume. Als Eintragseigenschaft gilt das in jeder Vorlage, ohne `occurredAt` zu doppeln. Specs 02/05/11 angepasst, neue ID BLK-19 (M8). | entschieden (User + Loop) |
| A-011 | Backup-Code = 128 Bit Zufall **+ 32 Bit Prüfsumme** (SHA-256-Präfix) → 32 Base32-Zeichen in 4 Gruppen à 8 (`XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`). Die Prüfsumme erkennt Tippfehler sofort (`wrong-backup-code`) statt erst nach PBKDF2. | 128 Bit ergeben 26 Base32-Zeichen, die sich nicht in 8er-Gruppen teilen; die Prüfsumme füllt auf 4×8 und verbessert die Fehlermeldung. Entropie bleibt 128 Bit. | entschieden (Loop, vom User delegiert 2026-11-12) |
| A-012 | Install-Skript von `better-sqlite3` ist per `allowScripts` in `v3/package.json` **verweigert**; das Paket lädt seine mitgelieferten N-API-Binaries (`prebuilds/`: win32/darwin/linux/linuxmusl, x64/arm64). | Sonst startet `npm ci` implizit `node-gyp rebuild`, das ohne Windows SDK bzw. Build-Tools scheitert (ARC-01 deckte es auf). Für Plattformen ohne Prebuild müsste die Freigabe zurückgenommen und eine Toolchain bereitgestellt werden. | entschieden (Loop, vom User delegiert 2026-11-12) |
| A-013 | `editor` darf die Record-Arten `entry` und `attachmentMeta` pushen; `template`, `templateVersion`, `diary`, `intakeKey` und `savedFilter` nur `owner`. Ein Push mit einer verbotenen Op wird **komplett** mit 403 abgelehnt. | Spec 09 nennt Einträge/Vorlagen/Einstellungen, aber nicht `savedFilter`/`attachmentMeta`. Konservativ gewählt; die Liste steht an einer Stelle (`members/service.ts` `EDITOR_KINDS`). | entschieden (Loop, vom User delegiert 2026-11-12) |
| A-014 | QA-08 (Docker) braucht einen laufenden Docker-Daemon. Lokal ist nur die CLI vorhanden (Docker Desktop nicht gestartet). Dockerfiles, `docker-compose.yml` und der Test `scripts/docker-compose.test.mjs` liegen bereit; ohne Daemon wird der Test übersprungen und QA-08 bleibt offen. **Optionen:** (a) Docker Desktop starten → Loop prüft QA-08 und schließt M4 ab; (b) QA-08 nach M13 (Betrieb) verschieben und mit M5 weitermachen. | Meilenstein-Reihenfolge ist verbindlich; die Verschiebung einer ID ist eine Entscheidung des Users. | gelöst: Docker Desktop läuft (User, 2026-11-12) |
| A-015 | HLC-Format `<ms, 13 Stellen>:<Zähler, 4 hex>:<Knoten-ID>` (Knoten-ID ohne `:`); Gleichstand entscheidet die Knoten-ID. Entry-Merge: neben Blockwerten folgen auch `templateId`, `templateVersion`, `occurredAt`, `period`, `meta`, `authorId` der 3-Wege-Regel mit HLC; Ergebnis-HLC = Maximum beider Seiten (die Engine vergibt beim erneuten Push einen neuen). | Spec 04 legt das Format nicht fest und regelt nur Blöcke/Tags/`deleted`. | entschieden (Loop) |
| A-016 | Konfliktpfad der Engine: `template` hat kein HLC-Feld → Felder einzeln (3-Wege), neuerer Stand nach `updatedAt` gewinnt, `currentVersion` = Maximum. `diary`/`savedFilter`/übrige: ganzer Datensatz, neuer nach HLC (falls vorhanden) sonst `updatedAt`. `templateVersion` mit anderem Inhalt unter gleicher ID ist **nicht** automatisch auflösbar: Op bleibt mit `lastError = templateVersion-collision` stehen (übrige Ops laufen weiter); die Umnummerierung auf n+2 (Spec 04) baut der Vorlagen-Editor in M8. Max. 3 Push-Runden je Lauf; ConflictLog nur lokal (ohne Outbox). | Spec 04 nennt die Regeln, aber Templates tragen kein HLC und die Umnummerierung braucht die Editor-Logik. | entschieden (Loop) |
| A-017 | Spec 08 (Intake einrichten: Rolle owner/editor) widerspricht der Rollentabelle in Spec 09 (editor: Intake nein). Entschieden für Spec 08: Editoren dürfen einen eigenen Kurzbefehl-Intake einrichten (Server-Endpunkt + Push von `intakeKey`); Spec 09 entsprechend präzisiert. A-013 erweitert. | Ein zweites Mitglied soll per Siri eintragen können; der private Intake-Schlüssel ist ohnehin nur mit dem DK lesbar, den das Mitglied schon hat. | entschieden (Loop) |
| A-018 | Open-Meteo: statt `current` + `hourly` nur **Stundenwerte** (Wert der vollen Stunde von `occurredAt`, Luftdruck-Δ = Wert 24 h zuvor). Zeitnah (≤ 48 h) Forecast-API mit `past_days=3`, älter Archiv-API. Variablen: temperature_2m, apparent_temperature, surface_pressure, relative_humidity_2m, precipitation, cloud_cover, wind_speed_10m, weather_code. | Gleicher Weg für Echtzeit, Nachtrag und Migration; `observedAt` ist laut Spec 02 ohnehin die volle Stunde. | entschieden (Loop) |
| A-019 | Der Docker-Test (QA-08) läuft nur noch auf Anforderung: `npm run verify:docker` (setzt `STB_DOCKER=1`). Normales `verify` überspringt ihn; QA-08 zählt weiterhin nur mit echtem Durchlauf. Vor dem Abschluss eines Meilensteins bzw. vor Gates läuft `verify:docker` einmal. | Das Bauen/Starten der Container bei jedem `verify` (~alle 4 min) lief parallel zu den übrigen Tests; danach stürzte die WSL-Engine von Docker Desktop ab. | entschieden (Loop, vom User delegiert) |
| A-020 | Kurzbefehl mit Freitext/Restwerten für eine Vorlage **ohne** Notizfeld: kein Eintrag, sondern ein Eingangs-Item (Spec 08 sieht „Tag Kurzbefehl + Notiz" vor, Einträge haben aber kein freies Notizfeld). Einträge aus Kurzbefehlen bekommen eine aus der Server-Item-ID abgeleitete UUID v7, damit Doppelabholungen auf demselben Record landen; `authorId` ist der Ersteller des Kurzbefehls. | Review M4–M6, Befunde 3, 7, 12: nichts darf verschwinden, keine Duplikate, „erfasst von" korrekt. | entschieden (Loop) |

## Abhängigkeiten

| Paket | Workspace | Zweck | Lizenz | Verworfene Alternative |
|---|---|---|---|---|
| `typescript` | root (dev) | Typecheck/Build (`tsc -b`) | Apache-2.0 | — (Spec 01) |
| `eslint` | root (dev) | Lint inkl. Abhängigkeitsregeln | MIT | Biome (keine gleichwertigen Import-Regeln) |
| `@eslint/js` | root (dev) | ESLint-Basisregeln (`recommended`) | MIT | — |
| `typescript-eslint` | root (dev) | TS-Parser + Regeln (`no-explicit-any`) | MIT | — |
| `globals` | root (dev) | Globale Variablen je Umgebung für ESLint | MIT | manuelle Liste |
| `vitest` | root (dev) | Unit-/Integrationstests, JSON-Report | MIT | Jest (kein natives ESM/Vite) |
| `@types/node` | root (dev) | Node-Typen für Skripte/Server | MIT | — |
| `zod` | core, sync-protocol, server | Schemas = Typen + Laufzeitvalidierung (Spec 01) | MIT | valibot (kleiner, aber Spec 01 legt zod fest; OpenAPI-Anbindung) |
| `dexie` | web | IndexedDB-Zugriff, Transaktionen (Spec 01/02) | Apache-2.0 | idb (zu niedrig, keine Indizes/Transaktions-Helfer) |
| `fake-indexeddb` | web (dev) | IndexedDB in Node-Tests (Spec 01) | Apache-2.0 | jsdom (hat kein IndexedDB) |
| `fastify` | server | HTTP-API (Spec 01) | MIT | express (kein Schema-/Typ-Fokus) |
| `better-sqlite3` | server | SQLite synchron, Transaktionen (Spec 01) | MIT | `node:sqlite` (noch experimentell, schwächere API) |
| `@types/better-sqlite3` | server (dev) | Typen für better-sqlite3 | MIT | — |
