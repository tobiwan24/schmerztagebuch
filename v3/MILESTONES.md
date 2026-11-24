# Meilensteine v3.0

Reihenfolge ist verbindlich. Ein Meilenstein ist fertig, wenn `npm run verify` grün ist **und**
`npm run acceptance -- --milestone Mx` alle automatisierten IDs dieses Meilensteins als erfüllt meldet.
`manual`-IDs werden vom User in [PROGRESS.md](PROGRESS.md) abgehakt; sie blockieren nur die Gates.
Jede Spec-ID steht in **genau einem** Meilenstein (`npm run acceptance -- --structure` prüft das).

| M | Titel | Akzeptanz-IDs | Gate danach |
|---|---|---|---|
| M0 | Gerüst: Monorepo, Tooling, Prüfskript | ARC-01 ARC-02 ARC-03 ARC-05 ARC-06 QA-06 QA-11 | — |
| M1 | Domäne `core`: IDs, Schemas, Blöcke, Vorlagenversionen | DM-01 DM-02 DM-03 DM-04 DM-05 DM-06 DM-07 DM-11 BLK-01 BLK-02 BLK-04 BLK-13 BLK-16 BLK-18 | — |
| M2 | Krypto `crypto` | CRY-01 CRY-02 CRY-03 CRY-04 CRY-05 CRY-06 CRY-07 | — |
| M3 | Web-Datenschicht: Dexie, Codec, Repositories | DM-08 DM-09 DM-10 DM-12 BLK-06 BLK-08 | — |
| M4 | Server: Auth, Records, Mitglieder, Intake | ARC-04 CRY-13 CRY-14 SYN-03 SHR-05 SHR-06 SHR-07 SHR-08 VOI-03 VOI-04 VOI-10 QA-08 | — |
| M5 | Sync-Engine | SYN-01 SYN-02 SYN-04 SYN-05 SYN-07 SYN-08 SYN-12 SYN-13 SYN-16 DM-13 | — |
| M6 | Client-Logik Teilen, Intake, Wetter | SHR-03 SHR-04 SHR-11 VOI-01 VOI-05 VOI-06 VOI-07 VOI-08 BLK-11 BLK-12 BLK-14 BLK-17 | **G1 Wireframes** |
| M7 | UI-Grundgerüst, Onboarding, Entsperren | UI-01 UI-03 UI-04 UI-05 UI-06 UI-07 UI-33 CRY-08 CRY-09 CRY-10 CRY-11 CRY-12 CRY-16 SYN-10 SYN-15 | — |
| M8 | Einträge, Vorlagen, Schnelleintrag, Sync im UI | BLK-03 BLK-05 BLK-07 BLK-09 BLK-10 BLK-15 BLK-19 SYN-06 SYN-09 SYN-11 SYN-14 CRY-15 | **G2 Kernablauf** |
| M8b | Body-Map vollständig wie v2 (User-Entscheidung nach G2) | BLK-20 BLK-21 | — |
| M9 | Suche, Filter, Vergleich, Standard-Ansichten | ANA-01 ANA-02 ANA-03 ANA-04 ANA-05 ANA-06 ANA-07 ANA-08 ANA-09 ANA-10 ANA-11 ANA-12 ANA-13 ANA-14 ANA-15 | — |
| M10 | Export, Import, Backup | EXP-01 EXP-02 EXP-03 EXP-04 EXP-05 EXP-06 EXP-07 EXP-08 EXP-09 EXP-10 EXP-11 EXP-12 | — |
| M11 | Migration v2 → v3 | MIG-01 MIG-02 MIG-03 MIG-04 MIG-05 MIG-06 MIG-07 MIG-08 MIG-09 MIG-10 MIG-11 MIG-12 MIG-13 MIG-14 MIG-15 | **G3 Auswertung & Export** |
| M12 | Teilen- und Kurzbefehl-UI, Erinnerungen, Diagnose | SHR-01 SHR-02 SHR-09 SHR-10 VOI-02 VOI-09 UI-02 UI-08 UI-09 | — |
| M13 | Härtung, Betrieb, Ablösung | QA-01 QA-02 QA-03 QA-04 QA-05 QA-07 QA-09 QA-10 | **G4 Ablösung** |
| M14 | Nacharbeiten v2-Parität: Vorlagen-Editor, Formular, Tagebuch-Einstellungen, Wetter, Parität | BLK-22 BLK-23 BLK-24 BLK-25 BLK-26 BLK-27 SYN-17 SYN-18 DM-14 UI-14 UI-15 BLK-37 BLK-38 BLK-39 BLK-32 BLK-33 BLK-34 BLK-28 BLK-29 BLK-30 BLK-31 BLK-35 BLK-36 BLK-40 UI-16 UI-17 UI-18 UI-19 | — |
| M14b | Teil-Meilenstein v2-Parität, Rest: Formular-Parität, Verlauf/Auswertung/PDF, Auto-Sicherung, Sicherheit/Geräte, Einstellungen, Tagebuch-Umschalter | BLK-41 BLK-42 BLK-43 BLK-44 ANA-17 ANA-18 ANA-19 ANA-20 ANA-21 EXP-14 EXP-15 EXP-16 EXP-17 CRY-18 CRY-19 CRY-20 UI-20 UI-21 UI-22 UI-23 UI-24 MIG-17 | — |
| M14c | Gate-Feedback 2026-11-16 (Vorrang vor restlichem M14b): PDF-Download-Bug, Schnelleintrag überarbeiten, Verlauf ohne „Neuer Eintrag", Body-Map-Bild im Eintrag, Export im Verlauf | EXP-19 BLK-45 BLK-46 UI-25 BLK-47 EXP-18 | — |

## Meilensteine v3.x

Nach v3.0 (siehe A-080). Gleiche Regeln wie oben; die `manual`-IDs dieser Meilensteine blockieren nichts (keine Gates).
Reihenfolge verbindlich, Plan und Aufgaben in [PROGRESS.md](PROGRESS.md).

| M | Titel | Akzeptanz-IDs | Gate danach |
|---|---|---|---|
| M15 | v3.x: Neuigkeiten (RDM-011) und Tutorial | UI-26 UI-27 UI-28 UI-29 | — |
| M16 | v3.x: Medikamenten-Block (RDM-018) | BLK-48 BLK-49 BLK-50 ANA-22 ANA-23 EXP-20 | — |
| M17 | v3.x: Training View (RDM-005) | BLK-51 BLK-52 UI-30 UI-31 UI-32 ANA-24 ANA-25 | — |
| M18 | v3.x: Arzt-Link (verschlüsselter, befristeter Bericht) | EXP-21 EXP-22 EXP-23 EXP-24 EXP-25 | — |
| M19 | v3.x: LLM (Ollama/Claude, Freigabe pro Vorgang) | ARC-07 VOI-12 VOI-13 VOI-14 BLK-53 VOI-15 VOI-16 VOI-17 | — |
| M20 | v3.x: Zusammenhänge, Auslöser, Schwellwert-Hinweise (RDM-006) | ANA-26 ANA-27 ANA-28 ANA-29 ANA-30 ANA-31 | — |
| M21 | v3.x: Dashboard-Baukasten | DM-15 SYN-19 ANA-32 EXP-26 | — |
| M22 | v3.x: Schlüsselrotation, feinere Rechte, Hinweis auf neue Einträge | CRY-21 CRY-22 SHR-13 SHR-14 SHR-15 SHR-16 | — |
| M23 | v3.x: Lokale Verschlüsselung und persistierter Suchindex | DM-16 DM-17 DM-18 ANA-33 DM-19 | — |
| M24 | v3.x: Integrationen, client-sdk, MCP | CRY-23 CRY-24 ARC-08 EXP-27 EXP-28 | — |

## Manuelle Kriterien (Abhaken in PROGRESS.md)

| Gate | IDs |
|---|---|
| G1 | UI-10 |
| G2 | UI-11 CRY-17 |
| G3 | UI-12 ANA-16 EXP-13 |
| G4 | UI-13 MIG-16 VOI-11 SHR-12 |
| v3.x (nicht blockierend) | EXP-25 VOI-17 ANA-31 SHR-16 DM-19 |

## Hinweise zur Reihenfolge

- M1–M5 sind reine Logik/Server und eignen sich für autonomes Arbeiten des Loops.
- Vor M7 **muss** G1 freigegeben sein (`PROGRESS.md`: `- [x] UI-10`). Bis dahin dürfen keine Ansichten gebaut werden;
  Wireframes liegen in `v3/design/`.
- Nach G2/G3 wird Feedback des Users als Aufgaben in `PROGRESS.md` erfasst und **vor** dem nächsten Meilenstein erledigt.
- M13 endet mit der Checkliste aus [spec/11-migration-v2.md](spec/11-migration-v2.md#ablösung-gate-g4-meilenstein-m13).
  Das Deployment stellt nur der User um.
- M14 (2026-11-16) arbeitet die Nacharbeiten vor der Umstellung (G4) ab; UI-13 bleibt beim User. `GATE-G4.md` wird am Ende von M14 aktualisiert.
