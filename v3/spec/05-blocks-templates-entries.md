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
| `medication` | `presets: [{id, name, dose?, unit, color}]`, `units` (Standard mg, ml, Stk, Tropfen, Hub), `allowFree: boolean` | `{ items: [{ id, presetId?, name, dose?: number, unit?, at?: ISO, effect?: 0..10 }] }` (max. 20) | Ereignis je Medikament + Dosis numerisch |

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

## Vorlagen-Editor

Route `/more/templates/new` und `/more/templates/:id` (nur `owner` bzw. local-only, A-002). Kopf: Name, Icon (feste Liste von Lucide-Icons wie v2 `TemplateStylePicker`), Farbe (8 Token-Farben). Blockliste: Palette mit allen 7 Typen (Standard-`config` aus `core/template-editor.ts`), je Block Label, Beschreibung, Pflicht, Rolle und die typabhängige Konfiguration aus der Tabelle oben; Umsortieren per Griff (Pointer) und Pfeiltasten (Fractional Index); Entfernen mit Hinweis „vorhandene Werte bleiben als archiviertes Feld sichtbar". Typwechsel wird nicht angeboten. Speichern über `updateTemplate`: Änderungen an Blöcken ergeben Version n+1, Name/Icon/Farbe nur `Template`. Ungespeicherte Änderungen warnen wie im Eintragsformular. „Duplizieren" legt eine Kopie mit neuen IDs an (Version 1, ohne Einträge). Beim Bearbeiten eines Eintrags einer älteren Version wird er auf die aktuelle Version gehoben, wenn kein Wert verloren geht; sonst bleibt seine Version (Hinweis).

## Einträge

- Felder: alle Blöcke der aktuellen Vorlagenversion, Zeitangabe, Tags.
- **Zeitangabe** (in jeder Vorlage, ersetzt den v2-Pflicht-Datum-Block): Umschalter **Zeitpunkt / Zeitraum** wie in v2.
  Zeitpunkt = `occurredAt` (Standard: jetzt, änderbar — auch zum Nachtragen vergangener Tage). Zeitraum = `period`
  mit Beginn und Ende als Datum, Uhrzeiten optional; `occurredAt` ist dann der Beginn.
- Pflichtfelder (`required`) blockieren das Speichern mit Hinweis am Feld.
- Speichern ist lokal und sofort (< 100 ms), Sync danach im Hintergrund.
- Bearbeiten erhält `id`, erhöht `updatedAt` und HLC.
- „Ungespeicherte Änderungen"-Warnung nur bei echten Änderungen (Vergleich mit Ausgangswert, Lehre aus ISS-029).
- **Tags:** frei, Chips mit Vorschlägen aus dem Tagebuch (Regeln BLK-28).
- **Löschen** im Detail mit Bestätigung (Tombstone, Anhang-Metadaten werden mitgelöscht; kein Rückgängig). **Duplizieren** öffnet das Formular vorbefüllt (Werte der aktuellen Version, Tags; ohne Anhänge und Wetter; Zeitpunkt jetzt).
- **Textarea** (Port v2): Ereignis/Arztbesuch mit Titel (ohne eigene Uhrzeit → gehört zum Eintragstag), Foto/PDF als Anhang. Anhänge bleiben bis zum Speichern im Speicher; Bilder über 2 MB werden auf max. 2000 px (JPEG 0,85) verkleinert, Dateien bis 20 MB.

## Schnelleintrag

- **Im Vorlagen-Editor** festgelegt: je Block ein Schalter „Im Schnelleintrag" (`Template.quickBlockIds`, nicht versioniert wie Name/Icon; Reihenfolge folgt der Vorlage). Ohne Auswahl gilt die Standardregel (alle `outcome`-Blöcke, sonst der erste Slider). Die frühere Auswahl in den Tagebuch-Einstellungen entfällt; bestehende Einstellungen (`quickEntryTemplateId`/`quickEntryBlockIds`) werden beim ersten Start in die Vorlage übernommen, sofern sie dort noch keine Auswahl hat (A-070).
- **Auswahl der Vorlage** im Schnelleintrag: alle aktiven Vorlagen des Tagebuchs (jede hat Schnelleintrag-Felder, notfalls per Standardregel) als Auswahl oberhalb der Felder; die zuletzt genutzte ist vorausgewählt (sonst die erste in Vorlagen-Reihenfolge).
- Erreichbar mit **einem Tipp** von der Startseite; Speichern mit höchstens **drei Tipps** insgesamt (Vorauswahl der Vorlage = kein Tipp).
- Weitere Felder können später im Eintrag ergänzt werden (`meta.source = 'quick'`).
- **Schnell-Buttons je Vorlage:** Die Tagebuch-Einstellung `quickTemplateIds` wählt Vorlagen, die auf Start einen eigenen Knopf „Schnell: <Vorlage>“ bekommen (`/quick?template=<id>`, Vorlage vorausgewählt); ohne Auswahl bleibt der eine Knopf „Schnell eintragen“.
- Mehrere beschreibbare Tagebücher: Start zeigt je Tagebuch einen Knopf (`/quick?diary=<id>`); `/quick` ohne Parameter zeigt dann eine Auswahl. Wetter wie im Formular (fester Ort / `gpsDefault`).

## Wetter als Metadaten

- Pro Tagebuch an/aus (`settings.weather.enabled`, Standard: an, sobald ein fester Ort gesetzt ist).
- **Ort:** Standard ist der **feste Ort des Tagebuchs** (`settings.weather.location`, gesetzt per Ortssuche über die
  Open-Meteo-Geocoding-API oder einmalig per GPS). Im Eintragsformular gibt es einen Schalter „Aktuellen Standort
  verwenden" (Vorbelegung `settings.weather.gpsDefault`); nur dann wird die Geolocation-API aufgerufen.
- Ohne festen Ort und ohne GPS wird kein Wetter abgefragt (Hinweis in den Tagebuch-Einstellungen).
- Beim Speichern: Ort auf ~10 km runden (1 Dezimalstelle), Open-Meteo abfragen (Stundenwerte inkl. Luftdruckänderung 24 h, A-018). Speicherung in `meta.weather`/`meta.location` (mit `origin`), synchronisiert nur verschlüsselt.
- Speichern wartet nie auf das Netz: Der Eintrag wird mit `weatherPending` und gerundetem Ort gespeichert, die Abfrage läuft danach im Hintergrund und aktualisiert den Eintrag (neuer HLC). Mit GPS-Schalter wird die Position (max. 10 s) im Hintergrund bestimmt (Rückfall A-009). Der Schalter erscheint nur bei neuen Einträgen in Tagebüchern mit aktivem Wetter; beim Bearbeiten bleibt der Ort, bei `occurredAt`-Änderung > 1 h wird am gespeicherten Ort neu ermittelt.
- Offline oder Fehler: Eintrag bleibt als `weatherPending` markiert; Nachtrag über die Archiv-API anhand `occurredAt` + gerundetem Ort beim Entsperren und bei `online`.
- **Ortssuche:** Open-Meteo-Geocoding (`geocoding-api.open-meteo.com/v1/search?name=…&count=5&language=de`), nur der eingegebene Ortsname verlässt das Gerät; Ort setzen schaltet Wetter an. Im Onboarding ist der Ort ein optionaler Schritt.
- Wetterfelder stehen in Suche, Filter, Dashboards und Analysen wie numerische Blöcke zur Verfügung (06).
- Die Abfrage geht direkt vom Gerät an Open-Meteo (kein Umweg über den eigenen Server).

## Medikamenten-Block (v3.x, M16)

Blocktyp `medication` (Tabelle oben), Standardrolle `medication`. Bestehende `multiselect`-Blöcke mit Rolle `medication` bleiben unverändert (keine Zwangsumwandlung). Wirkung 0–10 ist optional; keine Einnahme-Erinnerung je Medikament. Intake/Zwischenablage bilden `values` für einen Medikamenten-Block (Namen oder Objekte) auf `items` ab; Unbekanntes landet im Eingang. Auswertung: siehe 06, Export: siehe 07. Die Katalog-Vorlage „Schmerztagebuch mit Medikamenten“ nutzt den Block.

## Training (v3.x, M17)

Training baut auf Vorlagen und Einträgen auf, nicht auf eigenen Tabellen. `Template.purpose?: 'diary' | 'training'` (Standard `diary`) und `Template.functionPhases?: number[]` sind optional und unversioniert, wie `quickBlockIds`. Neuer Blocktyp `exercise`: Konfiguration `description?, steps?: string[] (≤ 20), targetSets?, targetReps?, targetDurationSec?, videoUrl? (nur https), levels?: [{id, label}]`; Wert `{ done, sets?, reps?, durationSec?, levelId?, painDuring?: 0..10 }`. Die aktuelle Funktionsphase ist der jüngste Wert eines Blocks mit Rolle `function` im Tagebuch; Vorlagen ohne Phasen erscheinen immer. Video als Link und/oder als hochgeladene Datei (RDM-033, A-149): `videoMediaId?` und Schrittbilder (`steps[]` ist `string | { text?, imageId? }`) verweisen auf Records `exerciseMedia` (Inhalt als Blob, Sync/Backup wie Anhänge, je Datei ≤ 20 MB; CSP `media-src 'self' blob:`); kein Einbetten fremder Seiten. Keine automatischen Vorschläge für Stufenwechsel (Nicht-Ziel Therapieempfehlung). Editor-Mitglieder dürfen Trainingseinträge schreiben, aber keine Vorlagen anlegen (A-002). Trainingsvorlagen erscheinen nicht in den Kacheln auf Start. UI: siehe 10; Erinnerung „Übungen“ neben der Tagebuch-Erinnerung.

## LLM-Rollenvorschlag

Der Vorlagen-Editor kann Rollen je Block vorschlagen (Freigabe pro Vorgang, Details in 08).

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
| BLK-22 | Editor-Domäne: `newBlock(type)` liefert für alle 7 Typen eine gültige Standard-`config` (BLK-01-Schemas); `validateTemplateDraft` meldet leeres Label, Slider `min ≥ max` oder `step ≤ 0`, Multiselect ohne Option und doppelte Optionslabels; `duplicateTemplate` vergibt neue IDs für Vorlage, Blöcke und Optionen, Name „… (Kopie)", Version 1, Order direkt nach dem Original. | unit |
| BLK-23 | Vorlagen-Editor: leere Vorlage anlegen; Name, Icon und Farbe ändern erzeugt keine neue Version und erscheint in Vorlagenliste und Eintragsformular; „Duplizieren" erzeugt eine unabhängige Kopie (Änderung an der Kopie ändert das Original nicht). | e2e |
| BLK-24 | Vorlagen-Editor: Blöcke aller 7 Typen hinzufügen und konfigurieren (Slider min/max/step/Einheit/Beschriftungen, Checkbox mit Notiz, Multiselect-Optionen mit Farbpalette und Reihenfolge per Ziehen + einfach/mehrfach, Text-Maximallänge, Textarea Ereignisse/Anhänge, Datum-Modus, Body-Map-Standardbild), Pflicht und Rolle setzen; Speichern erzeugt Version n+1 und ein neuer Eintrag zeigt die Felder mit dieser Konfiguration. | e2e |
| BLK-25 | Vorlagen-Editor: Blöcke per Ziehen und per Tastatur umsortieren und entfernen → neue Version; ein älterer Eintrag zeigt den entfernten Wert als „Archiviertes Feld"; Verlassen mit ungespeicherten Änderungen warnt (nur nach echter Änderung); ein Typwechsel wird nicht angeboten. | e2e |
| BLK-26 | Multiselect-Option in einer neuen Version umbenannt oder entfernt: alte Einträge zeigen in Detail, Verlauf und Auswertung das Label ihrer eigenen Version, nie eine nackte Options-ID. | integration |
| BLK-27 | Bearbeiten eines Eintrags einer älteren Version hebt ihn auf die aktuelle Version, wenn dabei kein Wert verloren geht (alle Werte gültig in der aktuellen Version); sonst bleibt die Version des Eintrags und das Formular zeigt einen Hinweis. | unit |
| BLK-28 | Tags: Normalisierung (trimmen, Leerraum zusammenfassen, max. 40 Zeichen, kein Komma), höchstens 20 Tags, Duplikate ohne Rücksicht auf Groß-/Kleinschreibung (erste Schreibweise bleibt); Vorschläge = vorhandene Tags des Tagebuchs mit passendem Präfix, nach Häufigkeit, max. 8. | unit |
| BLK-29 | Eintragsformular: Tag per Enter, Komma und Vorschlag hinzufügen, per × entfernen; gespeichert in `tags`, im Detail als Chips sichtbar, Verlaufssuche findet den Eintrag über den Tag; Tag-Änderung zählt als ungespeicherte Änderung. | e2e |
| BLK-30 | Anhänge eines Eintrags: Speichern schreibt Inhalte (Upload-Warteschlange) und Metadaten vor dem Eintrag; Entfernen beim Bearbeiten löscht die Metadaten (Tombstone, synchronisiert) und den lokalen Inhalt; Dateien über 20 MB und andere Typen als Bild/PDF werden abgelehnt; Verwerfen des Formulars hinterlässt nichts in `records`, `blobs` oder `blob_outbox`. | integration |
| BLK-31 | Textarea (Port v2 `TextAreaBlock`): Ereignis und Arztbesuch mit Titel hinzufügen und entfernen, Foto und PDF anhängen (Bild-Vorschau im Formular) und entfernen; nach dem Speichern zeigt das Detail Ereignisse mit Kategorie und die Anhänge (öffnbar); `allowEvents`/`allowAttachments = false` blendet die jeweiligen Knöpfe aus. | e2e |
| BLK-32 | Wetter-Planung beim Speichern: `initialWeatherMeta` setzt bei festem Ort sofort `weatherPending` + gerundeten Ort (`origin: 'diary'`), mit GPS-Schalter erst nach Positionsbestimmung (`origin: 'gps'`, Rückfall A-009); beim Bearbeiten nur bei `occurredAt`-Änderung > 1 h eine Neuermittlung am gespeicherten Ort, GPS wird beim Bearbeiten nie abgefragt. | unit |
| BLK-33 | Eintragsformular und Schnelleintrag mit Wetter: Tagebuch mit festem Ort → Eintrag bekommt `meta.weather` (Open-Meteo per Route gemockt) mit `origin: 'diary'`; Schalter „Aktuellen Standort verwenden" (vorbelegt mit `gpsDefault`) → `origin: 'gps'` mit gerundeter Position; Wetter aus → kein Schalter, keine Geolocation, kein Request; Speichern navigiert, bevor Open-Meteo antwortet. | e2e |
| BLK-34 | Nachtrag: beim Entsperren und beim Ereignis `online` werden Einträge mit `weatherPending` aller Tagebücher nacheinander nachgetragen (ein Lauf zur Zeit), danach ohne `weatherPending` und mit neuem HLC; fehlgeschlagene bleiben markiert. | integration |
| BLK-35 | Eintrag-Detail „Löschen": Bestätigungsdialog; Bestätigen entfernt den Eintrag aus Detail, Start und Verlauf (Tombstone mit neuem HLC, zugehörige Anhang-Metadaten ebenfalls gelöscht); Abbrechen ändert nichts. | e2e |
| BLK-36 | Eintrag-Detail „Duplizieren": öffnet das Formular vorbefüllt mit Vorlage, Werten (abgebildet auf die aktuelle Version, ohne archivierte Felder und ohne Anhänge) und Tags, Zeitpunkt = jetzt; Speichern erzeugt einen neuen Eintrag mit neuer ID, das Original bleibt unverändert. | e2e |
| BLK-37 | Schnelleintrag pro Tagebuch (Auswahl ab M14c im Vorlagen-Editor, BLK-45; bis dahin in den Tagebuch-Einstellungen): gewählte Vorlage + Blöcke erscheinen in `/quick?diary=<id>`; bei mehreren beschreibbaren Tagebüchern zeigt der Start je Tagebuch einen Schnelleintrag-Knopf (Speichern weiter in ≤ 3 Tipps), `/quick` ohne Parameter zeigt dann eine Auswahl; ohne Einstellung gilt die Standardregel. | e2e |
| BLK-38 | Ortssuche: Geocoding-Request erst ab 2 Zeichen (`count=5`, `language=de`), Treffer als „Ort, Region, Land"; gewählter Ort wird auf 1 Dezimalstelle gerundet gespeichert; „Aktuellen Standort übernehmen" rundet ebenso; Fehler/offline → Hinweis, nichts gespeichert. | unit |
| BLK-39 | Wetter-Ort setzen im Onboarding (optionaler, überspringbarer Schritt) und in den Tagebuch-Einstellungen (Ortssuche mit gemockter Geocoding-API oder Standort) → `settings.weather.location` gesetzt, Wetter an; Ort entfernen → Wetter aus und Hinweis „Ohne Ort kein Wetter". | e2e |
| BLK-40 | Standardbilder „Körper Vorderseite/Rückseite" haben in den äußeren 4 Pixelspalten links keine sichtbaren Pixel (Alpha = 0) — Regression für das Artefakt bei y≈470. | unit |
| BLK-41 | Eintragsformular: Slider-`infoText` als aufklappbarer Info-Hinweis am Feld; Multiselect-Optionen in ihrer Farbe (Kontrast AA, ausgewählt deutlich unterscheidbar); Blöcke mit `hideLabel` zeigen kein sichtbares Label (zugänglicher Name bleibt). | e2e |
| BLK-42 | Eintragsformular (neu, mehrere Vorlagen): Wischen nach links/rechts wechselt die Vorlage wie die Auswahlknöpfe; mit Eingaben nur nach Rückfrage (BLK-09-Regel). | e2e |
| BLK-43 | `BlockDef.hideLabel` (optional) wird von Schema, Editor (je Block und „alle Labels ein/aus") und JSON-Export unterstützt; Umschalten erzeugt eine neue Version (Spec 02: Label-Darstellung ist Struktur). | unit |
| BLK-44 | Start zeigt Vorlagen-Kacheln (Icon, Farbe, Name) aller aktiven Vorlagen beschreibbarer Tagebücher in Vorlagen-Reihenfolge; ein Tipp öffnet `/entry/new?template=<id>` mit dieser Vorlage; im Konto-Modus Begrüßung mit Benutzernamen. | e2e |
| BLK-45 | Schnelleintrag im Vorlagen-Editor: je Block Schalter „Im Schnelleintrag" (`quickBlockIds`, keine neue Vorlagenversion); `/quick` zeigt genau diese Blöcke in Vorlagen-Reihenfolge, ohne Auswahl die Standardregel; frühere Tagebuch-Einstellungen werden migriert und sind in den Tagebuch-Einstellungen nicht mehr einstellbar. | e2e |
| BLK-46 | Schnelleintrag mit Vorlagenwahl: `/quick` bietet alle aktiven Vorlagen des Tagebuchs zur Auswahl, die zuletzt genutzte ist vorausgewählt; Wechsel tauscht die Felder (mit Eingaben nur nach Rückfrage, BLK-09-Regel); Speichern bleibt in ≤ 3 Tipps. | e2e |
| BLK-47 | Eintrags-Detailansicht (`/entry/:id`, aus dem Verlauf): Körperkarten-Felder zeigen das Bild mit Markierungen (Punkte/Pinsel, Nummern, Kommentare) schreibgeschützt, mit Standard- und eigenem Bild; Feld ohne Markierung zeigt das Bild ohne Marker. | e2e |
| BLK-48 | `core/blocks/medication.ts`: zod-Schema für config und value, `emptyValue`, `isEmpty`, `toDisplay`, `toAnalysis`, `toCsv`; ungültige Dosis bzw. mehr als 20 Positionen werden abgelehnt. | unit |
| BLK-49 | Editor: Palette „Medikamente“, Vorgaben bearbeiten (Name, Dosis, Einheit, Farbe, Reihenfolge). Formular: „+ Medikament“ aus den Vorgaben oder frei, Dosis, Einheit, Uhrzeit, Wirkung, Entfernen. Detailansicht und Schnelleintrag zeigen die Positionen. | e2e |
| BLK-50 | Katalog-Vorlage „Schmerztagebuch mit Medikamenten“ ist gültig. Intake/Zwischenablage: `values` für einen Medikamenten-Block (Namen oder Objekte) wird auf `items` abgebildet; Unbekanntes landet im Eingang. | unit |
| BLK-51 | `core/blocks/exercise.ts`: Schemas und Funktionen wie bei jedem Blocktyp; `videoUrl` nur https; Analyse = Ereignis „erledigt“ + Sätze, Wiederholungen und Dauer numerisch. | unit |
| BLK-52 | `core/training.ts`: `purpose`/`functionPhases` rückwärtskompatibel im Schema und im Export-Schema; `trainingTemplatesFor(templates, entries)` wählt nach der jüngsten `function`-Rolle (Fixture). | unit |
| BLK-53 | Vorlagen-Editor „Rollen vorschlagen“: Vorschläge je Block, einzeln übernehmen oder verwerfen, Freigabedialog wie bei VOI-14. | e2e |
| BLK-54 | `core/exercise-media.ts` + `blocks/exercise.ts`: Schritte als Text (alt) oder `{ text?, imageId? }`, `videoMediaId`, Metadaten-Schema `exerciseMedia`; `checkExerciseMediaFile` nimmt Video (mp4/webm/mov) und Bilder (ohne SVG) bis 20 MB an. | unit |
| BLK-55 | JSON v1: Feld `exerciseMedia` im Schema, Export nur zu vorhandenen Vorlagen, Rundweg, Import-Prüfung (Vorlage fehlt → inkonsistent), „Als Kopie“ schreibt `videoMediaId`/`imageId` um; ältere Dateien ohne Feld bleiben lesbar. | unit |
| BLK-56 | Editor: Schritt mit Bild und Video hochladen, zu großes Video wird mit Hinweis abgelehnt; nach Speichern im Training: Video abspielbar (`blob:`-Quelle), Schritt-Ansicht mit Bild und Vor/Zurück. | e2e |
| BLK-57 | Echtes iPhone-Video (.mov, ≤ 20 MB) und Schrittfotos in der installierten App hochgeladen; im Training auf iPhone und einem zweiten Gerät (nach Sync) abgespielt bzw. angezeigt. | manual |
