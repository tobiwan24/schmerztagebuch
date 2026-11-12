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
| A-008 | Abhängigkeitsregeln (Spec 01) werden mit den ESLint-Kernregeln `no-restricted-imports` (Paketnamen `@stb/*`, `react`, `dexie`, …, Pfadmuster `**/apps/<app>/**`, `**/data/db*`) und `no-restricted-properties`/`no-restricted-globals` umgesetzt statt mit `import/no-restricted-paths`. | Pakete importieren einander über Workspace-Namen, nicht über Pfade; `no-restricted-paths` bräuchte zusätzlich Plugin + TS-Resolver. Wirkung laut ARC-02/03 identisch; Umstieg auf das Plugin ist jederzeit möglich. | offen |
| A-009 | GPS-Schalter aktiv, aber Standort nicht verfügbar (verweigert/Fehler) → Rückfall auf den festen Ort des Tagebuchs (`origin: 'diary'`); ohne festen Ort wird kein Wetter ermittelt und **kein** `weatherPending` gesetzt. | Spec 05 regelt den Fall nicht; ohne Ort kann der spätere Nachtrag nichts abfragen. Änderbar in `core/weather.ts` `resolveEntryWeather`. | offen |
| A-010 | Der v2-Pflicht-Block „Datum" entfällt im v3-Katalog; jeder Eintrag hat `occurredAt` (Spec 02/05). Die Migration (M11) bildet den v2-Datumswert auf `occurredAt` ab. Katalog-Rollen: Schmerzstärke=`outcome`, Notizen=`note`, weitere sinngemäß; Body-Map-Standard = v2-Preset-ID `default-koerper-vorderseite`. | Ein zusätzlicher Datum-Block würde `occurredAt` doppeln und Auswertungen verwirren. | offen |
| A-011 | Backup-Code = 128 Bit Zufall **+ 32 Bit Prüfsumme** (SHA-256-Präfix) → 32 Base32-Zeichen in 4 Gruppen à 8 (`XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`). Die Prüfsumme erkennt Tippfehler sofort (`wrong-backup-code`) statt erst nach PBKDF2. | 128 Bit ergeben 26 Base32-Zeichen, die sich nicht in 8er-Gruppen teilen; die Prüfsumme füllt auf 4×8 und verbessert die Fehlermeldung. Entropie bleibt 128 Bit. | offen |
| A-012 | Install-Skript von `better-sqlite3` ist per `allowScripts` in `v3/package.json` **verweigert**; das Paket lädt seine mitgelieferten N-API-Binaries (`prebuilds/`: win32/darwin/linux/linuxmusl, x64/arm64). | Sonst startet `npm ci` implizit `node-gyp rebuild`, das ohne Windows SDK bzw. Build-Tools scheitert (ARC-01 deckte es auf). Für Plattformen ohne Prebuild müsste die Freigabe zurückgenommen und eine Toolchain bereitgestellt werden. | offen |

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
