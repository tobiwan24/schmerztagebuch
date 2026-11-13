# 05 — Blöcke, Vorlagen, Einträge, Schnelleintrag, Wetter

## Blocktypen

| Typ | Konfiguration (`config`) | Wert (`BlockValue`) | Datenart für Analyse |
|---|---|---|---|
| `slider` | `min`, `max` (≤ 10 Standard, frei einstellbar), `step`, `unit?`, `minLabel?`, `maxLabel?`, `infoText?` | `number` | numerisch |
| `checkbox` | `withNote: boolean` | `{ checked: boolean, note?: string }` | Ereignis |
| `multiselect` | `options: [{ id, label, color }]`, `multiple: boolean` | `string[]` (Options-IDs) | Ereignis je Option |
| `text` | `maxLength?`, `placeholder?` | `string` | Text |
| `textarea` | `allowAttachments`, `allowEvents` | `{ text?, events?: [{ id, category: 'event' \| 'doctor', title, at? }], attachmentIds?: string[] }` | Text + Ereignisse |
| `date` | `mode: 'date' \| 'datetime' \| 'duration' \| 'range'` | `{ at?: ISO } \| { start: ISO, end: ISO } \| { minutes: number }` | Zeit/Dauer |
| `bodymap` | `defaultPresetId` (Standardbild oder eigenes Bild; wird beim Öffnen **vorausgewählt angezeigt**) | `{ presetId, points: [{ id, x: 0..1, y: 0..1, intensity?: number, kind?: 'point' \| 'brush', size?: 0..1, comment?: string, path?: [{ x, y }] }] }` | Regionen/Punkte |

- Alle Block-Komponenten aus v2 (`src/components/blocks/*`, insbesondere BodyMap) werden **portiert**, nicht neu
  erfunden: Logik übernehmen, auf neue Wertformen und shadcn-Komponenten umstellen.
- **Body-Map vollständig wie v2** (User-Entscheidung 2026-11-13, DECISIONS A-024): Werkzeuge **Punkt** und **Pinsel**
  (Strich als Pfad normalisierter Koordinaten), **Größe** klein/mittel/groß (normalisierter Durchmesser relativ zur
  Bildbreite), **Intensität** 1–10 (Farbe grün/gelb/orange/rot), **Kommentar je Markierung**, Nummerierung in
  Reihenfolge, Entfernen mit Neunummerierung. **Eigene Bilder**: hochladen (verkleinert auf max. 1000×1400, JPEG),
  **zuschneiden** (Seitenverhältnis wählbar), als eigenes Bild des Tagebuchs speichern (Record-`kind` `bodymapImage`,
  verschlüsselt synchronisiert), löschen, **als Standard des Feldes setzen** (`defaultPresetId`). Zuschneiden oder
  Bildwechsel mit vorhandenen Markierungen nur nach Rückfrage (Markierungen gehen verloren).
- Jeder Typ hat in `packages/core/blocks/<typ>.ts`: zod-Schema für `config` und `value`, `emptyValue()`,
  `isEmpty(value)`, `toDisplay(value, def)`, `toAnalysis(value, def)` (Normalform für 06), `toCsv(value, def)`.

## Vorlagen

- Anlegen leer, aus Katalog (v2 `templateCatalog` portiert) oder durch Duplizieren.
- **Reihenfolge der Vorlagen per Drag & Drop editierbar** (Fractional Index, 02). Ebenso Reihenfolge der Blöcke.
- Archivieren statt Löschen, solange Einträge existieren; endgültiges Löschen nur mit Bestätigung + Anzahl betroffener Einträge.
- Rollen pro Block im Editor optional setzbar. *(v3.x: Vorschlag per LLM, nie automatisch übernommen.)*

## Einträge

- Felder: alle Blöcke der aktuellen Vorlagenversion, Zeitangabe, Tags.
- **Zeitangabe** (in jeder Vorlage, ersetzt den v2-Pflicht-Datum-Block): Umschalter **Zeitpunkt / Zeitraum** wie in v2.
  Zeitpunkt = `occurredAt` (Standard: jetzt, änderbar — auch zum Nachtragen vergangener Tage). Zeitraum = `period`
  mit Beginn und Ende als Datum, Uhrzeiten optional; `occurredAt` ist dann der Beginn.
- Pflichtfelder (`required`) blockieren das Speichern mit Hinweis am Feld.
- Speichern ist lokal und sofort (< 100 ms), Sync danach im Hintergrund.
- Bearbeiten erhält `id`, erhöht `updatedAt` und HLC.
- „Ungespeicherte Änderungen"-Warnung nur bei echten Änderungen (Vergleich mit Ausgangswert, Lehre aus ISS-029).

## Schnelleintrag

- Pro Tagebuch konfigurierbar: Vorlage + Auswahl der Blöcke für den Schnelleintrag (Standard: alle `outcome`-Blöcke, sonst der erste Slider).
- Erreichbar mit **einem Tipp** von der Startseite; Speichern mit höchstens **drei Tipps** insgesamt.
- Weitere Felder können später im Eintrag ergänzt werden (`meta.source = 'quick'`).

## Wetter als Metadaten

- Pro Tagebuch an/aus (`settings.weather.enabled`, Standard: an, sobald ein fester Ort gesetzt ist).
- **Ort:** Standard ist der **feste Ort des Tagebuchs** (`settings.weather.location`, gesetzt per Ortssuche über die
  Open-Meteo-Geocoding-API oder einmalig per GPS). Im Eintragsformular gibt es einen Schalter „Aktuellen Standort
  verwenden" (Vorbelegung `settings.weather.gpsDefault`); nur dann wird die Geolocation-API aufgerufen.
- Ohne festen Ort und ohne GPS wird kein Wetter abgefragt (Hinweis in den Tagebuch-Einstellungen).
- Beim Speichern: Ort auf ~10 km runden (1 Dezimalstelle), Open-Meteo abfragen (Forecast-API `current` + `hourly`
  für Luftdruckänderung 24 h). Speicherung in `meta.weather`/`meta.location` (mit `origin`), synchronisiert nur
  verschlüsselt.
- Offline oder Fehler: Eintrag wird ohne Wetter gespeichert und als `weatherPending` markiert; Nachtrag über die
  Archiv-API anhand `occurredAt` + gerundetem Ort, sobald online.
- Wird `occurredAt` nachträglich deutlich (> 1 h) geändert, wird das Wetter neu ermittelt.
- Wetterfelder stehen in Suche, Filter, Dashboards und Analysen wie numerische Blöcke zur Verfügung (06).
- Die Abfrage geht direkt vom Gerät an Open-Meteo (kein Umweg über den eigenen Server).

## Backlog v3.x

- Medikamenten-Block mit Wirkstoff/Dosis/Wirkung (RDM-018) — bis dahin `multiselect` mit Rolle `medication`.
- LLM-Rollenvorschlag im Vorlagen-Editor.

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| BLK-01 | Für jeden Blocktyp: zod-Schema akzeptiert gültige und lehnt ungültige `config`/`value` ab (tabellengetriebene Tests). | unit |
| BLK-02 | `toAnalysis` liefert für jeden Blocktyp die in der Tabelle genannte Datenart. | unit |
| BLK-03 | Body-Map zeigt beim Öffnen eines neuen Eintrags das `defaultPresetId`-Bild bereits ausgewählt. | e2e |
| BLK-04 | Slider: `min`/`max`/`step` werden eingehalten; Werte außerhalb werden abgelehnt. | unit |
| BLK-05 | Vorlagen per Drag & Drop umsortieren; Reihenfolge bleibt nach Reload und auf Zweitgerät erhalten. | e2e |
| BLK-06 | Umsortieren von Blöcken im Editor erzeugt eine neue Vorlagenversion; alte Einträge werden weiterhin korrekt dargestellt. | integration |
| BLK-07 | Pflichtfeld leer → Speichern blockiert, Hinweis am Feld. | e2e |
| BLK-08 | Eintrag offline speichern dauert < 100 ms (Median über 50 Speichervorgänge, fake-indexeddb). | integration |
| BLK-09 | „Ungespeicherte Änderungen"-Warnung erscheint nur nach echter Änderung, nicht nach bloßem Öffnen oder Vorlagenwechsel ohne Eingabe. | e2e |
| BLK-10 | Schnelleintrag: von der Startseite in ≤ 3 Tipps gespeichert, `meta.source = 'quick'`. | e2e |
| BLK-11 | Wetter: Standort wird auf 1 Dezimalstelle gerundet, bevor er das Gerät verlässt (Request-Mitschnitt mit Mock). | unit |
| BLK-12 | Wetter wird verschlüsselt im Eintrag gespeichert; Offline-Eintrag wird als `weatherPending` markiert und später nachgetragen. | integration |
| BLK-13 | Änderung von `occurredAt` um > 1 h löst Neuermittlung des Wetters aus. | unit |
| BLK-14 | Wetter deaktiviert → keine Standortabfrage und kein Request an Open-Meteo. | integration |
| BLK-15 | Vorlage mit Einträgen kann nur archiviert werden; endgültiges Löschen zeigt Anzahl betroffener Einträge und verlangt Bestätigung. | e2e |
| BLK-16 | Alle v2-Katalogvorlagen sind in v3 verfügbar und erzeugen gültige Vorlagen. | unit |
| BLK-17 | Eintrag ohne GPS-Schalter nutzt den festen Ort des Tagebuchs (`origin: 'diary'`) und ruft die Geolocation-API nicht auf; mit Schalter `origin: 'gps'`. | integration |
| BLK-18 | Tagebuch ohne festen Ort und ohne GPS-Schalter: kein Request an Open-Meteo, Eintrag ohne `weatherPending`. | unit |
| BLK-20 | Body-Map: Punkt- und Pinsel-Markierungen mit Größe, Intensität und Kommentar werden gespeichert und nach dem Öffnen an derselben Stelle angezeigt; Entfernen nummeriert neu. | e2e |
| BLK-21 | Body-Map: eigenes Bild hochladen und zuschneiden, als Standard des Feldes setzen → neuer Eintrag zeigt es vorausgewählt; das Bild steht auf dem Zweitgerät zur Verfügung. | e2e |
| BLK-19 | Eintragsformular: Umschalter Zeitpunkt/Zeitraum; vergangener Zeitpunkt (Nachtragen) und Zeitraum mit und ohne Uhrzeiten werden gespeichert und in Verlauf/Detail korrekt angezeigt. | e2e |
