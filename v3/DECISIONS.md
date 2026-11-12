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

## Abhängigkeiten

| Paket | Workspace | Zweck | Lizenz | Verworfene Alternative |
|---|---|---|---|---|
| _noch keine_ | | | | |
