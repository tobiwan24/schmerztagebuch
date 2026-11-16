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
  range: { preset: 'day' | '7d' | '30d' | '90d' | '6m' | '1y' | 'all' } | { from: ISODate, to: ISODate }   // Custom-Zeitraum (RDM-010)
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
  | { kind: 'bodymap',  blockId?, region?: string }       // ohne blockId: irgendeine nicht leere Body-Map
  | { kind: 'attachment', attachmentKind?: 'image' | 'pdf' }  // aus attachmentMeta im Arbeitsset
  | { kind: 'event',    category?: 'event' | 'doctor' }
  | { kind: 'meta',     field: 'source' | 'author' | 'hasAttachment', value: string | boolean }
```

- Vorlagenübergreifend: Bedingungen können sich statt auf `blockId` auf eine **Rolle** beziehen (`role: 'outcome'`)
  und gelten dann für alle Blöcke mit dieser Rolle.
- Sortierung der Ergebnisliste: `newest | oldest | template_az | template_date` (stabil; pro Gerät gemerkt). Der Verlauf lädt
  seitenweise je 50 Einträge („Weitere laden"), Tagesgruppen bleiben über Seitengrenzen korrekt (ANA-20).
- Auswertungs-Zeiträume: `day | 7d | 30d | 90d | 6m | 1y`; „Tag" zeigt Einzelwerte mit Uhrzeit-Achse (ANA-17).
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

## Erweiterungen v3.x

- **Medikamente (M16):** Medikamententage und Häufigkeiten werten auch `medication`-Blöcke aus (je Name); Kreisdiagramm „Medikamente“ (Anteil je Medikament) unter Häufigkeiten.
- **Training (M17):** `trainingStats` (Tage mit erledigten Übungen je Woche, Verlauf der Stufe je Übung); die Auswertung zeigt bei vorhandenen Trainingseinträgen „Übungen“.
- **Zusammenhänge (M20):** Spearman auf Tageswerten, Zeitversatz 0–7 Tage, erst ab n ≥ 14 gemeinsamen Tagen; Lift für Auslöser (Ereignis an Tag d bzw. d−1 → Ergebnis ≥ Schwelle), erst ab 10 Fällen; immer mit Fallzahl und dem Hinweis „Zusammenhang ist keine Ursache“. Unterhalb der Mindestzahl erscheint keine Zahl; keine p-Werte, Stärke in Worten (schwach/mittel/stark).
- **Hinweise / Schwellwerte (M20):** Record-kind `notificationRule` `{ id, diaryId, blockId, op: '>=' | '<=', value, consecutiveDays, cooldownHours (Standard 24) }`, nur beschreibende Texte („Schmerz ≥ 7 an 3 Tagen in Folge“), keine Empfehlungen. Ausgelöst nach dem Speichern und beim Öffnen; Banner auf Start + lokale Notification über den Service Worker, falls erlaubt. Kein Push-Server.
- **Dashboard-Baukasten (M21):** `Dashboard { id, diaryId, name, order, widgets: [{ id, kind: 'timeseries' | 'heatmap' | 'medicationDays' | 'frequency' | 'bodymap' | 'correlation' | 'kpi', config, span: 1 | 2 }], hlc, updatedAt }`, Record-kind `dashboard`, Push nur durch den Owner, Konflikt: ganzer Datensatz per HLC. Die Standard-Ansichten bleiben unverändert.
- **Persistierter Suchindex (M23):** lokaler, verschlüsselter Record (nicht synchronisiert), inkrementell aktualisiert.
- **LLM-Zusammenfassung für den Arzt (M19):** siehe 08; sendet standardmäßig nur Kennzahlen aus dieser Spec.

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
| ANA-17 | Auswertung: zusätzliche Zeiträume „Tag" (Einzelwerte mit Uhrzeit-Achse, keine Tagesaggregation) und „6 Monate"; Vor/Zurück und Wischen verschieben um die Zeitraumlänge. | e2e |
| ANA-18 | Verlauf-Filter: freier Zeitraum (von–bis, Tagebuch-Zeitzone), Vorlagen-Auswahl, Inhalt (Ereignis, Arztbesuch, Body-Map, Foto, PDF); Kombination UND; als gespeicherter Filter wiederherstellbar. | e2e |
| ANA-19 | `applyFilter`: neue Bedingungen `bodymap` (nicht leer), `attachment` (Art `image`/`pdf`, aus `attachmentMeta` im Working-Set) und Ereignis-Kategorie liefern für die Fixture die erwarteten Einträge; `sortEntries` für `newest`, `oldest`, `template_az`, `template_date` stabil. | unit |
| ANA-20 | Verlauf: Sortierung wählbar (4 Optionen, bleibt nach Reload); Liste lädt seitenweise (50 Einträge, „Weitere laden"), Tagesgruppen bleiben korrekt über Seitengrenzen. | e2e |
| ANA-21 | „Diagramm als Eintrag speichern": PNG des aktuellen Verlaufsdiagramms wird Bild-Anhang eines neuen Eintrags einer gewählten Vorlage mit Textarea (Anhänge erlaubt), Text = Beschriftung; ohne passende Vorlage Hinweis statt Knopf. | e2e |
| ANA-22 | Arbeitsset, Filter (Bedingung Medikamentenname) und Suche erfassen `medication`; Medikamententage und Häufigkeiten zählen je Name. Fixture liefert die erwarteten Werte. | unit |
| ANA-23 | Auswertung → Häufigkeiten zeigt ein Kreisdiagramm „Medikamente“ (Anteil je Medikament im Zeitraum, Touch-Tooltip). | e2e |
| ANA-24 | `trainingStats`: Tage mit erledigten Übungen je Woche, Verlauf der Stufe je Übung (Fixture). | unit |
| ANA-25 | Auswertung zeigt bei vorhandenen Trainingseinträgen „Übungen“: Wochenbalken und Stufenverlauf. | e2e |
| ANA-26 | `correlate(a, b, lag)`: Fixture-Werte, n, Mindestzahl; < 300 ms bei 5.000 Einträgen. | unit |
| ANA-27 | `triggerLift`: Vierfeldertafel, Lift und Mindestzahl (Fixture). | unit |
| ANA-28 | Auswertung → „Zusammenhänge“: zwei Blöcke + Versatz → Koeffizient, Stärke in Worten, n, Warnhinweis; Liste der Auslöser mit Fallzahlen; unter der Mindestzahl nur der Hinweis. | e2e |
| ANA-29 | `evaluateRules(entries, rules, lastFired, now)`: aufeinanderfolgende Tage (Tagebuch-Zeitzone), Cooldown, beschreibender Text. | unit |
| ANA-30 | Einstellungen → Hinweise: Regel anlegen; ein Eintrag, der die Regel erfüllt, erzeugt ein Start-Banner (und `showNotification`, wenn erlaubt); innerhalb des Cooldowns nicht erneut. | e2e |
| ANA-31 | Hinweis-Notification auf dem iPhone (installierte PWA, iOS ≥ 16.4). | manual |
| ANA-32 | Auswertung → „Meine Dashboards“: anlegen, umbenennen, Widgets aus den Standard-Ansichten hinzufügen, verschieben (Zeiger + Tastatur), entfernen; bleibt nach Reload erhalten. | e2e |
| ANA-33 | Persistierter Index: Kaltstart-Suche bei 5.000 Einträgen < 500 ms; Index nach Eintragsänderung aktuell. | unit |
