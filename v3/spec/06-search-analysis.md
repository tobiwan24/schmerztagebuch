# 06 — Suche, Filter, Vergleich, Standard-Diagramme

v3.0 ist **rein beschreibend**: Es zeigt, was erfasst wurde, und vergleicht Zeiträume. Es behauptet keine
Zusammenhänge. Jede Kennzahl zeigt ihre Fallzahl `n`.

## Arbeitsset

- Nach dem Entsperren baut ein **Web Worker** (`apps/web/src/workers/analysis.worker.ts`) aus den Records der gewählten
  Tagebücher ein Arbeitsset im Speicher auf: Einträge mit aufgelösten Vorlagenversionen, Normalform je Wert
  (`toAnalysis`, 05) und Wetterfeldern.
- Der Worker hält einen **MiniSearch**-Index über Textwerte, Options-Labels, Tags, Ereignistitel und Vorlagen-/Blocknamen.
  Der Index wird nicht persistiert (Neuaufbau beim Entsperren und inkrementell bei Änderungen).
- Alle Funktionen der Filter- und Aggregationslogik liegen **pur** in `packages/analysis` und sind ohne Worker/DOM testbar.

## Filter (`FilterSpec`, zod-Schema in `packages/analysis`)

```ts
FilterSpec {
  diaryIds: string[]
  templateIds?: string[]
  range: { preset: '7d' | '30d' | '90d' | '1y' | 'all' } | { from: ISODate, to: ISODate }   // Custom-Zeitraum (RDM-010)
  text?: string                                   // Volltext (MiniSearch, unscharf, Präfix)
  tags?: { mode: 'any' | 'all', values: string[] }
  conditions?: Condition[]                        // UND-verknüpft
  anyOf?: Condition[][]                           // optional: eine Ebene ODER-Gruppen
}
Condition =
  | { kind: 'number',   blockId | weatherField, op: '<' | '<=' | '=' | '>=' | '>', value: number }
  | { kind: 'option',   blockId, optionIds: string[], mode: 'any' | 'all' | 'none' }
  | { kind: 'checkbox', blockId, checked: boolean }
  | { kind: 'text',     blockId, contains: string }
  | { kind: 'bodymap',  blockId, region?: string }
  | { kind: 'event',    category?: 'event' | 'doctor' }
  | { kind: 'meta',     field: 'source' | 'author' | 'hasAttachment', value: string | boolean }
```

- Vorlagenübergreifend: Bedingungen können sich statt auf `blockId` auf eine **Rolle** beziehen (`role: 'outcome'`)
  und gelten dann für alle Blöcke mit dieser Rolle.
- Gespeicherte Filter = `SavedFilter` (02), synchronisiert und per Tagebuch geteilt.
- Suche ist umlaut- und groß/klein-tolerant (`ä`≙`ae`, Normalisierung NFKD).

## Aggregation (verbindliche Semantik)

- Tagesgrenzen in der Zeitzone des Tagebuchs (`settings.timezone`), nicht des Geräts.
- Mehrere Einträge pro Tag: pro Kennzahl wählbar `mean` · `max` · `last` (Standard `max` für `outcome`, sonst `mean`).
- Leere Werte (`isEmpty`) zählen nicht in `n` und nicht in Mittelwerte.
- **Tage mit Eintrag** und **Tage ohne Eintrag** werden getrennt ausgewiesen; „kein Eintrag" ist nie „Wert 0".
- Werte aus archivierten Blöcken (alte Vorlagenversionen) sind über die Block-ID weiter auswertbar.

## Periodenvergleich

- Zwei Zeiträume (Standard: aktueller vs. vorheriger gleicher Länge, frei wählbar) **oder** zwei gespeicherte Filter.
- Pro numerischem Block / Wetterfeld: `n`, Mittelwert, Median, Min, Max, Anzahl Tage ≥ Schwelle (Schwelle frei wählbar).
- Pro Option / Checkbox / Rolle `medication`: Anzahl Tage, Anteil der erfassten Tage.
- Darstellung nebeneinander mit absoluter Differenz. **Keine** Signifikanzangaben, keine Ursachenformulierungen.
- Hinweis bei kleiner Fallzahl (`n < 7` pro Seite): „Wenige Daten — Unterschied kann zufällig sein."

## Standard-Ansichten (fest, nicht konfigurierbar in v3.0)

| Ansicht | Inhalt |
|---|---|
| **Verlauf** | Zeitreihe je numerischem Block (Tagesaggregation), wählbare Blöcke, optional Luftdruck als zweite Achse, Ereignisse (`event`/`doctor`) als Markierungen. |
| **Kalender-Heatmap** | Monatsansicht, Farbe = Tageswert eines gewählten Blocks (Standard: erster `outcome`), leere Tage neutral. |
| **Medikamententage** | Je Monat: Anzahl Tage mit Wert in Blöcken der Rolle `medication` (je Option getrennt). Optionale, vom Nutzer gesetzte Markierungslinie (z. B. 10 Tage) ohne Bewertungstext. |
| **Häufigkeiten** | Balken je Option/Checkbox im Zeitraum (ersetzt v2-MultiSelect-Diagramme). |
| **Body-Map-Übersicht** | Alle Punkte eines Zeitraums auf dem Preset-Bild überlagert (Deckkraft = Häufigkeit). |

- Diagramme mit shadcn Charts (Recharts). Jede Ansicht ist als PNG und als Teil des PDF-Exports exportierbar (07) —
  ersetzt den v2-Dashboard-Export (RDM-004).
- Touch: Tooltip per Tippen, horizontales Wischen verschiebt den Zeitraum.

## Leistungsbudgets (Fixture: 5.000 Einträge, 3 Vorlagen, 20 Blöcke)

| Vorgang | Budget |
|---|---|
| Arbeitsset + Index aufbauen (Worker) | < 1,5 s (Node, Referenzmaschine CI) |
| Filter anwenden | < 200 ms |
| Volltextsuche | < 100 ms |
| Periodenvergleich | < 300 ms |

## Backlog v3.x

- Korrelationen mit Zeitversatz, Auslöser-Analyse (Lift) — nur mit sichtbarer Fallzahl und Warnhinweisen.
- Konfigurierbarer Dashboard-Baukasten (`Dashboard`-Entität, Widgets).
- Persistierter Suchindex (relevant erst mit lokaler Verschlüsselung).
- Schwellwert-Benachrichtigungen (RDM-006).

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| ANA-01 | `FilterSpec`-Schema akzeptiert alle Bedingungsarten und lehnt unbekannte ab. | unit |
| ANA-02 | Filter-Engine liefert auf der Analyse-Fixture für 20 tabellarisch definierte Filter exakt die erwarteten Eintrags-IDs. | unit |
| ANA-03 | Rollenbedingung (`role: 'outcome'`) trifft Blöcke verschiedener Vorlagen. | unit |
| ANA-04 | Volltextsuche findet „Übelkeit" mit „uebelkeit", „Ubelk" und „übelkeit"; findet Options-Labels und Ereignistitel. | unit |
| ANA-05 | Tagesaggregation nutzt die Tagebuch-Zeitzone: Eintrag 23:30 Europe/Berlin zählt zum selben Tag, auch wenn das Gerät auf UTC steht. | unit |
| ANA-06 | `mean`/`max`/`last` pro Tag korrekt; leere Werte zählen nicht; Tage ohne Eintrag erscheinen nicht als 0. | unit |
| ANA-07 | Werte eines in Version 2 entfernten Blocks bleiben über die Block-ID auswertbar. | unit |
| ANA-08 | Periodenvergleich liefert für die Fixture die vorab berechneten Kennzahlen (n, Mittelwert, Median, Min, Max, Tage ≥ Schwelle). | unit |
| ANA-09 | Hinweis „Wenige Daten" erscheint genau dann, wenn eine Seite `n < 7` hat. | unit |
| ANA-10 | Medikamententage je Monat entsprechen der Fixture; mehrere Einnahmen am selben Tag zählen als ein Tag. | unit |
| ANA-11 | Gespeicherter Filter überlebt Reload und erscheint auf dem Zweitgerät. | e2e |
| ANA-12 | Leistungsbudgets aus der Tabelle werden eingehalten (Benchmark-Test mit 5.000-Einträge-Fixture). | integration |
| ANA-13 | Verlauf, Heatmap, Medikamententage, Häufigkeiten, Body-Map-Übersicht rendern mit Fixture-Daten ohne Konsolenfehler; Ereignismarkierungen erscheinen. | e2e |
| ANA-14 | Diagramm als PNG exportierbar (Download-Event im E2E-Test). | e2e |
| ANA-15 | Analyse-Texte enthalten keine kausalen Formulierungen (Lint-Test gegen Wortliste: „verursacht", „führt zu", „wegen"). | unit |
| ANA-16 | Diagramme sind auf dem iPhone per Touch bedienbar (Tooltip, Zeitraum wischen). | manual |
