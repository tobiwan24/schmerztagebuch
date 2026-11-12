# PROGRESS — laufender Stand v3

> Wird vom Loop gepflegt (siehe [LOOP.md](LOOP.md)). Manuelle Kriterien hakt **nur der User** ab.

## Aktuell

- **Meilenstein:** M0 — Gerüst: Monorepo, Tooling, Prüfskript
- **Nächste Aufgabe:** ARC-01 — Integrationstest „frischer Checkout": `git clone` von HEAD in ein Temp-Verzeichnis,
  `npm ci`, dann `typecheck`/`lint`/`deps:check`/`build` und die übrigen Tests (ohne Rekursion in ARC-01) ausführen.
  Danach M0 abschließen.
- **Erledigt in M0:** ARC-02 ARC-03 ARC-05 ARC-06 QA-06 QA-11
- **Blocker:** keine

## Meilensteine

| M | Status | Notiz |
|---|---|---|
| M0 | in Arbeit | 6/7 IDs, offen: ARC-01 |
| M1 | offen | |
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
