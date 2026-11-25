# 00 — Überblick, Prinzipien, Scope

## Vision

Ein privates, Ende-zu-Ende-verschlüsseltes Tagebuch für Schmerzen und Gesundheit — für sich selbst, für Kinder oder
Haustiere — mit **frei gestaltbaren Vorlagen**, schneller Erfassung (auch per Siri/Kurzbefehl), starker Suche,
Vergleichen, Dashboards und Analysen. Der Schwerpunkt liegt auf **Arzt und Therapie**: Die Daten werden so
strukturiert gespeichert, dass sie vielfältig exportiert, weiterverarbeitet und von Maschinen/KI gelesen werden können.

## Leitprinzipien (verbindlich, in dieser Rangfolge)

1. **Safe by design.** Alle fachlichen Daten (Einträge, Vorlagen, Namen, Tags, Wetter, Orte, Anhänge, Dashboards)
   sind Ende-zu-Ende-verschlüsselt. Der Sync-Server sieht nur IDs, Sequenznummern, Größen und Chiffretext.
   Ausnahmen nur über **explizite, sichtbare Freigabe** (Kurzbefehl-Intake in v3.0; LLM-Verarbeitung und Arzt-Link
   in v3.x) — siehe 07, 08.
   *Lokal* (IndexedDB) liegen die Daten in v3.0 unverschlüsselt, geschützt durch App-Sperre und Geräteverschlüsselung;
   lokale Verschlüsselung ist über den `PayloadCodec` nachrüstbar (02).
2. **Local-first.** Die lokale Datenbank ist immer die Arbeitskopie. Jeder Eintrag ist offline möglich und wird
   später synchronisiert.
3. **Zwei Betriebsmodi, eine Technik:** `cloud-primary` (Standard bei Cloud-Konto) und `local-only` (kein Server).
4. **Freie Vorlagen bleiben Kern.** Keine festen Schemata, keine standardisierten Scores. Semantik entsteht über
   Blocktypen und optionale Rollen (siehe 05, 06).
5. **Maschinenlesbar.** Stabile IDs, versionierte Vorlagen, Werte pro Block, selbstbeschreibende Exporte, API.
6. **Kein Datenverlust.** Jede Schreiboperation ist idempotent und testbar; Migrationen sind getestet.
7. **Einheitliches UI** auf Basis von shadcn/ui, Mobile-first, Dark Mode über Tokens.

## Stufen: v3.0 (MVP, ersetzt v2) und v3.x

v3.0 ersetzt v2 unter derselben Adresse. Alles, was mit **v3.x** markiert ist, wird in v3.0 **nicht** gebaut —
Datenmodell, Schlüsselhierarchie und Protokoll sind aber so angelegt, dass es ohne Umbau nachgerüstet werden kann.
v3.x-Punkte, die in einen Meilenstein M15+ übernommen sind, stehen im Spec-Text mit Akzeptanz-IDs (siehe [MILESTONES.md](../MILESTONES.md), „Meilensteine v3.x"). Im Abschnitt **„Backlog v3.x"** der Specs bleibt nur, was nicht eingeplant ist.

| Bereich | Spezifikation | v3.0 | v3.x |
|---|---|---|---|
| Architektur, Stack, Monorepo | [01-architecture.md](01-architecture.md) | ✔ | Pakete `llm`, `client-sdk`, App `mcp` |
| Datenmodell | [02-data-model.md](02-data-model.md) | ✔ | lokale Verschlüsselung (Codec-Tausch), Dashboards |
| Krypto, Auth, Geräte | [03-crypto-auth.md](03-crypto-auth.md) | ✔ | DK-Rotation, Integrationen |
| Sync, Modi, Offline | [04-sync.md](04-sync.md) | ✔ | — |
| Blöcke, Vorlagen, Einträge, Schnelleintrag, Wetter | [05-blocks-templates-entries.md](05-blocks-templates-entries.md) | ✔ | Medikamenten-Block (RDM-018) |
| Suche, Filter, Vergleich, Standard-Diagramme | [06-search-analysis.md](06-search-analysis.md) | beschreibend | Korrelation, Auslöser-Analyse, Dashboard-Baukasten |
| Export, Backup | [07-export-api.md](07-export-api.md) | ✔ | API-Tokens, MCP, Arzt-Link |
| Kurzbefehle (Siri) | [08-voice-llm.md](08-voice-llm.md) | ✔ | LLM (Ollama/Claude) |
| Geteilte Tagebücher | [09-sharing.md](09-sharing.md) | Einladung, Rollen, Fingerprint | DK-Rotation beim Entfernen |
| UI/UX | [10-ui.md](10-ui.md) | ✔ (mit Human-Gates) | Training View (RDM-005), Changelog (RDM-011) |
| Migration v2 → v3 | [11-migration-v2.md](11-migration-v2.md) | ✔ | — |
| Qualität, Tests, Budgets | [12-quality.md](12-quality.md) | ✔ | — |

Weitere v2-Roadmap-Punkte in v3.x: Schwellwert-Benachrichtigungen (RDM-006). RDM-010 (Custom-Zeitraum) ist in 06
bereits enthalten.

## Nicht-Ziele (v3)

- Keine standardisierten Fragebögen/Scores (MIDAS, HIT-6, …).
- Keine native App (Apple Health, Siri-Intents) — Siri-Anbindung ausschließlich über Apple Kurzbefehle.
- Kein FHIR-Export in v3 (Datenmodell muss ihn aber ohne Umbau ermöglichen → Backlog).
- Keine Diagnose- oder Therapieempfehlungen. Analysen beschreiben Zusammenhänge, nie Ursachen.
- Keine Änderungen am v2-Code.
- Kein In-App-Interview (gestrichen; Kurzbefehle decken den Bedarf).

## Glossar

| Begriff | Bedeutung |
|---|---|
| **Tagebuch (Diary)** | Container für eine Person/ein Tier („Ich", „Kind", „Hund"). Hat eigene Vorlagen, Einträge, Schlüssel. |
| **Mitglied (Member)** | Nutzer mit Rolle `owner`/`editor`/`viewer` in einem Tagebuch. |
| **Vorlage (Template)** | Benutzerdefinierte Sammlung von Blöcken. Versioniert. |
| **Block (BlockDef)** | Ein Feld einer Vorlage mit stabiler ID, Typ, Konfiguration, optionaler Rolle. |
| **Eintrag (Entry)** | Ausgefüllte Vorlage: Werte pro Block-ID + Metadaten (Zeit, Wetter, Quelle). |
| **Rolle** | Optionale Semantik eines Blocks (z. B. `outcome`, `medication`, `trigger`) für Analysen. |
| **Datensatz (Record)** | Verschlüsselte Sync-Einheit (Vorlage, Vorlagenversion, Eintrag, Dashboard, …). |
| **UMK** | User Master Key — schützt die privaten Schlüssel des Nutzers. |
| **DK** | Diary Key — symmetrischer Schlüssel eines Tagebuchs, pro Mitglied verpackt. |
| **Integration** | *(v3.x)* API-Client/MCP-Server, behandelt wie ein Gerät mit eigenem Schlüssel. |
| **PayloadCodec** | Schicht zwischen Repository und IndexedDB; v3.0 `plain`, später `aes` (lokale Verschlüsselung). |
| **Intake** | Server-Briefkasten für Kurzbefehle: nimmt Klartext entgegen, versiegelt ihn sofort mit dem Intake-Public-Key (08). |
| **Outbox** | Lokale Warteschlange ausstehender Schreiboperationen. |
| **HLC** | Hybrid Logical Clock — deterministische Ordnung für Konfliktauflösung. |

## Konventionen für alle Spezifikationen

- Jede Spezifikation endet mit einer Tabelle **Akzeptanztests** (`| ID | Kriterium | Ebene |`).
- `Ebene` ∈ `unit` · `integration` · `e2e` · `manual`.
- Jede nicht-`manual`-ID muss in **mindestens einem Testnamen** vorkommen, z. B. `it('DM-03: …')`.
  `scripts/check-acceptance.mjs` prüft das gegen die Test-Reports.
- IDs werden nie umnummeriert. Gestrichene Kriterien bleiben mit `~~durchgestrichen~~` stehen und Ebene `dropped`.
