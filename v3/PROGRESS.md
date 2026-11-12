# PROGRESS — laufender Stand v3

> Wird vom Loop gepflegt (siehe [LOOP.md](LOOP.md)). Manuelle Kriterien hakt **nur der User** ab.

## Aktuell

- **Meilenstein:** M1 — Domäne `core`: IDs, Schemas, Blöcke, Vorlagenversionen
- **Nächste Aufgabe:** BLK-16 — v2-Katalog (`../src/data/templateCatalog.ts`, nur lesen) nach `core/catalog.ts` portieren;
  Test: jede v2-Katalogvorlage hat ein v3-Gegenstück und erzeugt über `createTemplate` eine gültige Vorlage. Danach M1 abschließen.
- **Erledigt in M1:** DM-01 DM-02 DM-04 DM-05 BLK-01 BLK-04 DM-11 DM-03 DM-06 DM-07 BLK-02 BLK-13 BLK-18
- **Blocker:** keine

## Meilensteine

| M | Status | Notiz |
|---|---|---|
| M0 | erledigt | 7/7 IDs |
| M1 | in Arbeit | 13/14 IDs |
| M2 | offen | |
| M3 | offen | |
| M4 | offen | |
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
