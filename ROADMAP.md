# Schmerztagebuch PWA 2.0 - Roadmap

---

## 🔄 Git Workflow & Versionierung

**WICHTIG:** Seit 04.02.2026 nutzen wir Git mit Feature-Branch Workflow!

### Branch-Struktur:
- **`main`** - Produktions-Stand (stabil, nur Merges von develop)
- **`develop`** - Haupt-Entwicklungs-Branch (bereits angelegt via `git checkout -b develop` + `git push -u origin develop`)
- **`feature/*`** - Feature-Branches (z.B. `feature/dashboard-v2-migration`, `feature/template-editor-bulk-actions`)
- **`bugfix/*`** - Bugfix-Branches (z.B. `bugfix/dashboard-lines-not-showing`)
- **`hotfix/*`** - Dringende Fixes auf main (z.B. `hotfix/data-loss-ios`)

### Workflow für neue Features:
```bash
# 1. Vom develop-Branch aus neuen Feature-Branch erstellen
git checkout develop
git pull origin develop
git checkout -b feature/dashboard-v2-migration

# 2. Während der Entwicklung: Oft committen!
git add .
git commit -m "feat: ChartContainer implementation"
git commit -m "fix: color mapping for template lines"
git commit -m "refactor: extract chart config to hook"

# 3. Feature fertig: Push und Merge Request
git push -u origin feature/dashboard-v2-migration
# → Merge Request auf GitHub/GitLab erstellen: feature/* → develop

# 4. Nach Merge: Branch lokal löschen
git checkout develop
git pull origin develop
git branch -d feature/dashboard-v2-migration
```

### Commit-Konventionen (Conventional Commits):
- `feat:` - Neues Feature
- `fix:` - Bugfix
- `refactor:` - Code-Umstrukturierung ohne Funktionsänderung
- `style:` - CSS/UI Änderungen
- `docs:` - Dokumentation (README, Roadmap)
- `test:` - Tests hinzufügen/ändern
- `chore:` - Build, Dependencies, Config

### Branch-Naming:
- **Feature:** `feature/dashboard-v2-migration`, `feature/bulk-actions-template-editor`
- **Bugfix:** `bugfix/dashboard-lines-color`, `bugfix/touch-scrolling-editor`
- **Hotfix:** `hotfix/critical-data-loss`

**Claude erinnert sich:** Bei jedem neuen Feature/Task wird ein neuer Branch erstellt und häufig committed!

---

## ✅ Phase 1: Core Features (KOMPLETT)
- [x] Database Schema (IndexedDB/Dexie)
- [x] Template System
- [x] Block-Komponenten (Slider, TextArea, Date, Checkbox, MultiSelect)
- [x] Diary View mit Tab-Navigation
- [x] Editor Mode mit Drag & Drop
- [x] Template Style Picker (Icon + Farbe)
- [x] History View mit Filterung

## ✅ Phase 2: Advanced Features (KOMPLETT)
- [x] Encryption Support (AES-256)
- [x] Session Management
- [x] Settings Page
- [x] Template Export/Import
- [x] Entry Export (PDF)

## ✅ Phase 3: Dashboard & Analytics (KOMPLETT - außer v2)
- [x] Dashboard Page (Recharts Legacy)
- [x] Pain Data Aggregation
- [x] Line Chart mit Multi-Template Support
- [x] Event/Arztbesuch Tracking
- [x] Event Icons auf Chart-Datenpunkten
- [x] Template Toggle (Sichtbarkeit)
- [x] Zeitraum-Filter (7d/1m/3m/all)
- [x] DatePicker Range-Support (Zeiträume)

## ✅ Phase 4: Layout-Umstrukturierung & Glassmorphismus (KOMPLETT)

### A) DiaryView: Glassmorphismus + Pull-to-Reveal ✅ KOMPLETT
### B) Template-Editor: Direkter Einstieg & Glassmorphismus ✅ KOMPLETT

## ✅ Phase 4.5: UI & Workflow Verbesserungen (KOMPLETT)
- [x] Empty State konsolidieren
- [x] Pull-to-Reveal Console Logs entfernen
- [x] DiaryView Scrollable Layout Fix
- [x] "Personalisieren" im Hamburger-Menü

---

## 🔥 Phase 5: Template-Editor Workflow & Dashboard v2 (HIGH PRIO - IN ARBEIT)
**Priorität:** KRITISCH - Aktuelles Dashboard funktioniert nicht richtig!

### 1. Dashboard v2: Migration zu shadcn/ui Charts ⚠️ KRITISCH
**Branch:** `bugfix/dashboard-lines-color` oder `feature/dashboard-v2-migration`

**Problem:** Aktuelles Dashboard nutzt direktes Recharts OHNE shadcn/ui Patterns → **Lines werden nicht angezeigt!**

**Status:**
- ✅ shadcn/ui chart Komponente installiert (`/src/components/ui/chart.tsx`)
- ✅ Recharts 2.15.4 vorhanden
- ❌ Dashboard verwendet NICHT shadcn/ui Patterns
- ❌ CSS Variable Problem bei Line-Colors

**Was funktioniert bereits:**
- ✅ Multi-Template Lines (Recharts-Logik)
- ✅ Custom Event Icons mit `foreignObject`
- ✅ Template Visibility Toggle
- ✅ Zeitraum-Filter (7d/1m/3m/all)

**Migration-Tasks:**

- [ ] **A) Chart-Struktur migrieren**
  - ResponsiveContainer → ChartContainer
  - ChartConfig dynamisch aus templates erstellen
  - ChartTooltip mit ChartTooltipContent
  - **Zeile:** DashboardView.tsx (~200-400)
  - **Commit:** `feat: migrate to shadcn/ui ChartContainer`

- [ ] **B) Farb-Mapping fixen** ⚠️ KRITISCH
  - **Problem:** `var(--color-template_${template.id}_avg)` funktioniert nicht
  - **Lösung:** Direkte Farben aus chartConfig nutzen
  - Template.color → chartConfig → Line stroke
  - Debug-Logging entfernen nach Fix
  - **Zeile:** DashboardView.tsx (~295-350)
  - **Commit:** `fix: use direct colors from chartConfig for line strokes`

- [ ] **C) UI-Verbesserungen**
  - Badge-Toggle statt große Buttons (kompakter)
  - Dots nur bei Hover (cleaner)
  - Nur horizontale Grid-Linien
  - CardHeader/CardTitle Struktur
  - **Komponenten:** Card, Badge aus shadcn/ui
  - **Commit:** `style: improve dashboard UI with badges and cleaner grid`

- [ ] **D) Testing**
  - Multi-Template Charts mit echten Daten
  - Event-Icons funktionieren noch
  - Mobile Responsiveness
  - Performance mit 100+ Einträgen
  - **Commit:** `test: verify dashboard functionality with real data`

**Technische Details:**
```tsx
// VORHER (funktioniert nicht):
<ResponsiveContainer>
  <Line stroke={`var(--color-template_${id}_avg)`} />
</ResponsiveContainer>

// NACHHER (shadcn/ui Pattern):
<ChartContainer config={chartConfig}>
  <Line stroke={chartConfig[key]?.color || template.color} />
</ChartContainer>
```

---

### 2. Template-Editor: Optimierter Block-Workflow
**Branch:** `feature/template-editor-workflow-improvements`

**A) Pflichtfeld-Workflow für neue Blöcke**
- [ ] **Überschrift visuell als Pflichtfeld markieren**
  - Roter Rahmen bei leerem Label
  - Rot pulsierender Glow
  - Visueller Hinweis "Überschrift erforderlich"
  - **Komponente:** SortableBlock.tsx oder neues Modal
  - **Commit:** `feat: add required field indicator for block labels`

- [ ] **Auto-Focus auf Überschrift-Feld**
  - Cursor springt direkt ins Input
  - Keyboard öffnet sich auf Mobile
  - **useEffect** nach Block-Erstellung
  - **Commit:** `feat: auto-focus on label input for new blocks`

- [ ] **Block-Validierung**
  - Solange Label leer:
    - Block kann nicht gespeichert werden
    - Drag & Drop disabled
    - Optional: Tooltip "Überschrift erforderlich"
  - Sobald Label ausgefüllt:
    - Rot-Markierung verschwindet
    - Block vollständig editierbar
  - **Commit:** `feat: validate block label before enabling drag/save`

- [ ] **Testing**
  - Alle Block-Typen testen (Slider, Text, MultiSelect, etc.)
  - Mobile Touch-Optimierung
  - Keyboard-Navigation
  - **Commit:** `test: verify required field workflow for all block types`

**B) Bulk-Actions: Global Toggles**
**Branch:** `feature/template-editor-bulk-actions`

- [ ] **UI-Komponente erstellen**
  - Position: Unter TemplateStylePicker, vor BlockPalette
  - Design: 2 kompakte Switches nebeneinander
  - Icons: Activity (Dashboard) + EyeOff (Label)
  - Labels: "Alle in Dashboard" / "Labels ausblenden"
  - **Neue Komponente:** `BulkActionsPanel.tsx`
  - **Commit:** `feat: create BulkActionsPanel component`

- [ ] **"Alle Werte in Diagramme" Toggle**
  - Funktion: Aktiviert/Deaktiviert `dashboard.enabled` für ALLE Slider/BodyMap Blocks
  - Visuelles Feedback: "X von Y Blöcken Dashboard-aktiv"
  - State: Halb-Selected wenn teilweise aktiviert
  - onClick → alle Slider/BodyMap durchlaufen
  - **Commit:** `feat: implement bulk toggle for dashboard.enabled`

- [ ] **"Alle Überschriften ausblenden" Toggle**
  - Funktion: Aktiviert/Deaktiviert `hideLabelInDiary` für ALLE Blocks
  - Visuelles Feedback: "X von Y Labels ausgeblendet"
  - Hilfreich für minimalistisches Diary-Layout
  - onClick → alle Blocks durchlaufen
  - **Commit:** `feat: implement bulk toggle for hideLabelInDiary`

- [ ] **Integration**
  - EditorMode.tsx: BulkActionsPanel einbinden (Zeile ~350)
  - State-Management: editingBlocks updaten
  - Undo/Redo (optional): Bulk-Change als eine Aktion
  - Save-Button reagiert auf Änderungen
  - **Commit:** `feat: integrate BulkActionsPanel into EditorMode`

**C) Touch-Scrolling Fix**
**Branch:** `bugfix/editor-touch-scrolling`

- [ ] **DnD-Kit Touch-Sensor konfigurieren**
  - Problem: Scrolling via Touch funktioniert nicht über DnD-Komponenten
  - Lösung: `activationConstraint` in TouchSensor
  - **Zeile:** EditorMode.tsx (~50-70)
  - **Commit:** `fix: enable touch scrolling in editor with DnD`
  ```tsx
  useSensor(TouchSensor, {
    activationConstraint: { 
      delay: 200, 
      tolerance: 5 
    }
  })
  ```

---

## 🎯 Phase 6: UX-Verbesserungen (MEDIUM PRIO)
**Priorität:** MITTEL - Nice-to-have Features

### 1. Verlauf-Page: Datenanzeige optimieren
**Branch:** `feature/history-view-redesign`

- [ ] **Brainstorming: Bessere User Experience**
  - Problem analysieren: Was ist aktuell suboptimal?
  - Darstellungsformate evaluieren: Timeline? Kalender? Liste?
  - Filter-Optionen: Nach Template? Nach Datum? Nach Tags?
  
- [ ] **Design-Konzept erarbeiten**
  - Wireframes/Mockups erstellen
  - Performance berücksichtigen (große Datenmengen)
  
- [ ] **Implementierung**
  - HistoryView.tsx überarbeiten
  - Neue Filter-Komponenten
  - Testing mit echten Daten

### 2. PDF-Export: Datenpräsentation planen
**Branch:** `feature/pdf-export-enhancement`

- [ ] **Brainstorming: PDF-Layout & Inhalt**
  - Welche Daten exportieren?
  - Layout-Design (Tabelle? Diagramme?)
  - Branding (Logo, Farben)
  
- [ ] **Technische Konzeption**
  - Library evaluieren: jsPDF? pdfmake?
  - Chart-Integration
  
- [ ] **Implementierung**
  - PDF-Generator Utility
  - Export-UI in HistoryView

### 3. Konsistentes UI-Design
**Branch:** `refactor/ui-design-system`

- [ ] Design-Audit durchführen
- [ ] Inkonsistenzen identifizieren
- [ ] Design-System definieren
- [ ] CSS-Variablen zentralisieren
- [ ] Testing (Mobile & Desktop)

---

## 🏠 Phase 7: Code Cleanup & Refactoring (BACKLOG)
**Branch:** `chore/code-cleanup` oder einzelne Branches

### Ungenutzte Dateien entfernen:
- [ ] `src/styles/utilities.css` (leer, nur Kommentar)
- [ ] `src/components/TemplateEditor.tsx` (leer, nicht verwendet)
- [ ] `filterEntriesByTimeRange` in `dashboardData.ts` (doppelt vorhanden)

### CSS Konsolidierung:
- [ ] `layout.css` prüfen (viele Klassen nicht mehr verwendet)
- [ ] `Header.tsx` Komponente prüfen (evtl. obsolet)
- [ ] `blocks.css` durchgehen auf ungenutzte Klassen

### Code-Qualität:
- [ ] TypeScript: Stricter types für Block.value
- [ ] ESLint Warnings durchgehen
- [ ] Duplicate Code refactoren
- [ ] Console.logs entfernen (außer Error-Logs)

---

## 🔮 Phase 8: Future Features - Datenpersistenz & mehr (BACKLOG)
**Priorität:** NIEDRIG - Für spätere Release-Version

### Datenpersistenz: Cookie-Problem lösen
**Branch:** `feature/data-persistence-solution`

- [ ] **Problem-Analyse: IndexedDB & iOS**
  - **Hauptproblem:** IndexedDB wird bei Browser-Cleanup gelöscht
  - **Plattformen:** iPhone Safari, Android Chrome
  - **Impact:** Kompletter Datenverlust möglich

- [ ] **Lösungsansätze evaluieren**
  - File System Access API (nicht iOS-kompatibel)
  - Automatischer Backup & Restore (machbar)
  - Passwort-Manager Integration (zu prüfen)
  - Cloud Sync (langfristig)

- [ ] **Quick-Win: Export-Reminder**
  - Nach X Einträgen: "Backup erstellen?" Notification
  - Settings: "Backup erstellen" Button
  - Import-Helper bei leerem DB
  - Drag & Drop für .json Import

### Weitere Features:
- [ ] BodyMapBlock Implementation (vollständig)
- [ ] Chart Export (Image/PDF)
- [ ] Trend Analysis
- [ ] Multi-Language Support (i18n)
- [ ] Cloud Sync (E2E-verschlüsselt)
- [ ] Data Import/Export (CSV, JSON)

---

## 🐛 Known Issues / Tech Debt
- [ ] **KRITISCH:** Dashboard Lines werden nicht angezeigt (CSS Variable Problem)
- [ ] **WICHTIG:** IndexedDB Datenverlust bei Cookie-Cleanup (iOS) - später lösen
- [ ] Encryption: Event/Pain extraction in dashboardData.ts (decryptFn TODO)
- [ ] TypeScript: Stricter types für Block.value
- [ ] Performance: Große Entry-Mengen (>1000) können Charts verlangsamen


---> homepage: template-icons nicht automatisch mittig angeordnet,sondern links orientiert (bei z.b.2 Templates)
---

## 📊 Phase 6: Dashboard Performance & Advanced Visualizations (NEW)
**Branch:** TBD  
**Status:** 📅 Geplant

### 6.1 Performance & UX Fixes (KRITISCH) - Phase 1
- [x] Event-Config wird gespeichert (auch ohne textarea value)
- [ ] **Event-Icons Tooltip mit Überschrift**
  - Custom Tooltip Component erstellen
  - Event-Daten in chartData integrieren
  - Tooltip zeigt: Event-Titel, Beschreibung (textarea value), Datum
  - Hover über Event-Icon zeigt Tooltip

- [ ] **Punkte ausblenden, nur Event-Icons zeigen**
  - Dot-Radius auf 0 setzen ODER
  - Conditional rendering: `dot={hasEvent ? renderCustomDot(color) : false}`
  - Event-Icons bleiben sichtbar über unsichtbaren Dots

- [ ] **Performance-Fix: Adaptive Aggregation**
  - Problem: "Gesamt"-Ansicht bei 3 Jahren = ~1095 Datenpunkte → laggy
  - Lösung: Zeit-basierte Aggregation
  - `aggregateDataByWeek()` implementieren (für 3m Filter)
  - `aggregateDataByMonth()` implementieren (für "all" Filter)
  - `aggregateDataByTimeRange()` als Wrapper-Funktion
  - X-Achse Labels anpassen (Woche/Monat statt Tag)
  - Garantierte Performance: <50 Punkte bei "all"
  - **Aggregations-Regeln:**
    - `7d`: Täglich (7 Punkte)
    - `1m`: Täglich (30 Punkte)
    - `3m`: Wöchentlich (~13 Punkte)
    - `all`: Monatlich (12-36 Punkte bei 3 Jahren)

### 6.2 Funktionswerte-Visualisierung - Phase 2
- [ ] **Funktionswerte-Extraktion**
  - `FunctionDataPoint` Interface erstellen
  - `extractFunctionData()` implementieren (filtert `dashboard.type === 'function'`)
  - `aggregateFunctionByDay()` implementieren
  - State für `dailyFunctionData` in DashboardView

- [ ] **Zweiter LineChart für Funktionswerte**
  - Separater Chart-Container unterhalb Schmerzverläufe
  - Eigene Y-Achse (0-10 für Funktionswerte)
  - Gleiche X-Achse wie Schmerzverläufe (Datum)
  - Template-Filter funktioniert für beide Charts
  - Event-Icons auch auf Funktionswerte-Chart
  - **Unterschied Pain vs Function:**
    - Pain: Höherer Wert = schlechter (Rot bei 10)
    - Function: Höherer Wert = besser (Grün bei 10)
    - → Farbkodierung invertieren oder separate Palette

### 6.3 MultiSelect-Visualisierung (BarChart) - Phase 3
- [ ] **MultiSelect-Daten-Extraktion**
  - `MultiSelectData` Interface erstellen
  - `extractMultiSelectData()` implementieren
    - Extrahiert alle MultiSelect-Blocks mit `dashboard.enabled`
    - Zählt pro Option pro Tag wie oft sie ausgewählt wurde
    - Generiert Datenstruktur: `{ date, option1: count, option2: count, ... }`

- [ ] **BarChart Component**
  - Stacked BarChart mit Recharts
  - Dynamische Bar-Generierung basierend auf MultiSelect-Optionen
  - Farben aus `multiSelectOptions[].color` verwenden
  - Template-Filter funktioniert
  - Tooltip zeigt: Datum, Option, Count, Prozent
  - **Beispiel-Use-Cases:**
    - "Medikamente" → Wie oft wurde IBU 400 vs Triptan genommen?
    - "Begleitsymptome" → Übelkeit, Aura, Lichtempfindlichkeit Häufigkeit
    - "Schmerzart" → Migräne vs Spannungskopfschmerz vs Clusterkopfschmerz

**Best Practices (Research-Ergebnisse):**
- **Performance:** Recharts optimal <500 Punkte, laggy >5000
- **LTTB Algorithm:** Downsampling bei Beibehaltung visueller Form (99.4% Reduktion)
- **Adaptive Aggregation:** Zeit-basiert (Tag/Woche/Monat) - EMPFOHLEN für unser Projekt
- **Recharts Patterns:** LineChart für Trends, BarChart für Kategorien, ComposedChart für Kombination

**Offene Fragen:**
1. Funktionswerte-Farbschema: Invertierte Skala (10 = gut, grün)?
2. MultiSelect-BarChart: Stacked oder Grouped?
3. Event-Icons bei aggregierten Daten: Alle Events des Monats zeigen oder nur erster/letzter?

---

---

## 📊 Phase 6.4: Dashboard X-Achsen Fix - Feste Ticks mit positionsgenauer Darstellung (KRITISCH)
**Branch:** `feature/dashboard-fixed-x-axis-ticks`  
**Status:** 🔴 IN PLANUNG  
**Priorität:** KRITISCH - Aktuell zeigt X-Achse nicht die gewünschten festen Intervalle

### Problem-Analyse

**AKTUELLE SITUATION:**
- X-Achse nutzt `interval="preserveStartEnd"` (automatische Tick-Verteilung)
- Ticks erscheinen an zufälligen Positionen basierend auf Daten
- Keine konsistente Zeitraster-Darstellung
- User kann Zeitintervalle nicht intuitiv ablesen

**GEWÜNSCHTES VERHALTEN:**
- **FESTE TICKS** auf X-Achse (Beschriftungen) unabhängig von Daten
- **DATENPUNKTE** positionsgenau zwischen Ticks platziert
- **LINIEN IMMER VERBUNDEN** auch über Lücken hinweg

**RECHERCHE-ERKENNTNISSE (09.02.2026):**
- ❌ Recharts Issue #2126 (seit 2020): "Missing X ticks for time series with gaps" - OPEN
- ❌ Recharts Issue #1052 (2017): Community Workaround = Timestamps + type="number"
- ❌ `interval`-Property bezieht sich auf Array-Index, NICHT Zeitintervalle
- ✅ Lösung: `type="number"` mit Unix-Timestamps + feste Tick-Array
- ✅ Best Practice: D3.js nutzt .defined() für Gaps, connectNulls={true} für durchgezogene Linien
- ✅ Apple Health Pattern: Fixed intervals unabhängig von Daten (stride(by: .hour))

### Anforderungen (User-bestätigt)

#### X-Achse: Feste Ticks-Beschriftungen

**TAG (T):** Letzter kompletter Tag (00:00-23:59)
- Ticks: `0h`, `8h`, `16h`, `24h` (4 feste Beschriftungen)
- Datenpunkte: Nur wo Einträge existieren (z.B. 14:00, 18:30)
- Positionierung: Punkt bei 14:00 erscheint exakt zwischen 8h und 16h Ticks

**WOCHE (W):** Letzte komplette Woche (Mo-So)
- Ticks: `Mo`, `Di`, `Mi`, `Do`, `Fr`, `Sa`, `So` (7 feste Beschriftungen)
- Datenpunkte: Nur wo Einträge existieren (z.B. nur Di + Fr)
- Positionierung: Punkte erscheinen exakt am korrekten Wochentag

**MONAT (M):** Letzter kompletter Monat
- Ticks: `1.`, `10.`, `20.`, `31.` (4 feste Beschriftungen)
- Alternative (bessere UX): `1.`, `5.`, `10.`, `15.`, `20.`, `25.`, `31.` (7 Ticks)
- Datenpunkte: Nur wo Einträge existieren (z.B. 3., 15., 28.)
- Positionierung: Punkt am 15. erscheint exakt beim 15. Tick

**6 MONATE (6M):** Letzte 6 Monate
- Ticks: Monatskürzel (z.B. `Aug`, `Sep`, `Okt`, `Nov`, `Dez`, `Jan`)
- Datenpunkte: Wochendurchschnitte (ca. 26 Punkte über 6 Monate)
- Positionierung: Wochendurchschnitte positionsgenau im Monat

**JAHR (J):** Letzte 12 Monate
- Ticks: Jeden 2. Monat (z.B. `Jan`, `Mär`, `Mai`, `Jul`, `Sep`, `Nov`)
- Datenpunkte: Monatsdurchschnitte (12 Punkte)
- Positionierung: Monatsdurchschnitte positionsgenau

#### Linien-Verhalten
- `connectNulls={true}` - Linien IMMER durchgezogen
- Beispiel: Einträge nur Di + Fr → Linie von Di zu Fr durchgezogen (über Mi/Do)
- Best Practice: Ehrlich zeigt wo Daten fehlen, aber optisch zusammenhängend

### Technische Lösung

#### KRITISCH: Recharts Achsen-Typen verstehen

**TYPE 1: `type="category"` ❌ FUNKTIONIERT NICHT**
```tsx
<XAxis type="category" dataKey="date" ticks={['Mo', 'Di', 'Mi']} />
// Problem: Daten haben '2026-02-04', Ticks erwarten 'Di'
// Ergebnis: Punkte erscheinen GAR NICHT oder falsch
```

**TYPE 2: `type="number"` ✅ FUNKTIONIERT**
```tsx
<XAxis 
  type="number"
  domain={['dataMin', 'dataMax']}
  ticks={[timestamp_Mo, timestamp_Di, timestamp_Mi, ...]}
  tickFormatter={ts => formatWeekday(ts)}
/>
// Daten: Unix-Timestamps
// Ticks: Unix-Timestamps
// Ergebnis: Punkte positionsgenau!
```

### Implementierungs-Tasks

#### Task 1: Timestamp-Konvertierung
- [ ] **Funktion: dateToTimestamp(dateString: string): number**
  - Konvertiert ISO-Dates (`'2026-02-04'`) → Unix-Timestamps
  - Beispiel: `'2026-02-04'` → `1738627200000`
  - **Datei:** `src/utils/dashboardData.ts`
  - **Commit:** `feat: add date to timestamp conversion utility`

- [ ] **chartData mit Timestamps**
  - Aktuelle `date`-Property (String) → `timestamp`-Property (number)
  - Backwards-compatible: Behalte `date` für Events/Tooltips
  - Struktur: `{ date: '2026-02-04', timestamp: 1738627200000, avg: 7 }`
  - **Datei:** `src/pages/DashboardView.tsx` (chartData useMemo)
  - **Commit:** `feat: add timestamps to chartData for numeric axis`

#### Task 2: Tick-Generatoren (pro Zeitraum)

- [ ] **Funktion: generateDayTicks(date: Date): number[]**
  - Generiert 4 Timestamps: 0h, 8h, 16h, 24h für gewählten Tag
  - Beispiel: `[1738540800000, 1738569600000, 1738598400000, 1738627200000]`
  - **Commit:** `feat: add day ticks generator (0h, 8h, 16h, 24h)`

- [ ] **Funktion: generateWeekTicks(mondayDate: Date): number[]**
  - Generiert 7 Timestamps: Mo-So 00:00 für gewählte Woche
  - Beispiel: `[ts_Mo, ts_Di, ts_Mi, ts_Do, ts_Fr, ts_Sa, ts_So]`
  - **Commit:** `feat: add week ticks generator (Mo-So)`

- [ ] **Funktion: generateMonthTicks(year: number, month: number): number[]**
  - Generiert 4 oder 7 Timestamps: 1., 10., 20., 31. (oder 1., 5., 10., 15., 20., 25., 31.)
  - Berücksichtigt Monatslänge (28-31 Tage)
  - **Commit:** `feat: add month ticks generator`

- [ ] **Funktion: generate6MonthTicks(endDate: Date): number[]**
  - Generiert 6 Timestamps: Erster jedes Monats über 6 Monate
  - Beispiel: `[ts_Aug_1, ts_Sep_1, ts_Okt_1, ts_Nov_1, ts_Dez_1, ts_Jan_1]`
  - **Commit:** `feat: add 6-month ticks generator`

- [ ] **Funktion: generateYearTicks(endDate: Date): number[]**
  - Generiert 6 Timestamps: Erster von Jan, Mär, Mai, Jul, Sep, Nov
  - **Commit:** `feat: add year ticks generator (every 2 months)`

- [ ] **Wrapper-Funktion: getXAxisTicks(timeRange, now): number[]**
  - Ruft korrekten Generator basierend auf timeRange auf
  - Cached via useMemo (abhängig nur von timeRange, nicht von Daten!)
  - **Datei:** `src/pages/DashboardView.tsx`
  - **Commit:** `feat: add getXAxisTicks wrapper with useMemo`

#### Task 3: Tick-Formatter (Beschriftungen)

- [ ] **Funktion: formatDayTick(timestamp: number): string**
  - Timestamp → "0h", "8h", "16h", "24h"
  - **Commit:** `feat: add day tick formatter`

- [ ] **Funktion: formatWeekTick(timestamp: number): string**
  - Timestamp → "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"
  - Nutzt `toLocaleDateString('de-DE', { weekday: 'short' })`
  - **Commit:** `feat: add week tick formatter`

- [ ] **Funktion: formatMonthTick(timestamp: number): string**
  - Timestamp → "1.", "10.", "20.", "31."
  - Extrahiert Tag-Nummer + "." Suffix
  - **Commit:** `feat: add month tick formatter`

- [ ] **Funktion: format6MonthTick(timestamp: number): string**
  - Timestamp → "Aug", "Sep", "Okt", "Nov", "Dez", "Jan"
  - Nutzt `toLocaleDateString('de-DE', { month: 'short' })`
  - **Commit:** `feat: add 6-month tick formatter`

- [ ] **Funktion: formatYearTick(timestamp: number): string**
  - Timestamp → "Jan", "Mär", "Mai", "Jul", "Sep", "Nov"
  - Nutzt `toLocaleDateString('de-DE', { month: 'short' })`
  - **Commit:** `feat: add year tick formatter`

- [ ] **Wrapper: formatXAxisTick(timestamp, timeRange): string**
  - Ruft korrekten Formatter basierend auf timeRange auf
  - **Commit:** `feat: add formatXAxisTick wrapper`

#### Task 4: XAxis Integration

- [ ] **XAxis umbauen auf type="number"**
  ```tsx
  <XAxis
    type="number"  // ÄNDERUNG von category → number
    dataKey="timestamp"  // ÄNDERUNG von date → timestamp
    domain={['dataMin', 'dataMax']}
    ticks={getXAxisTicks(timeRange, now)}
    tickFormatter={(ts) => formatXAxisTick(ts, timeRange)}
    interval={0}  // Zeige ALLE Ticks
    tickLine={true}
    axisLine={true}
    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
    stroke="hsl(var(--border))"
  />
  ```
  - **Datei:** `src/pages/DashboardView.tsx`
  - **Commit:** `feat: migrate XAxis to numeric type with fixed ticks`

- [ ] **Line Component anpassen**
  ```tsx
  <Line
    dataKey={key}
    type="monotone"
    stroke={color}
    strokeWidth={2}
    dot={renderCustomDot(color)}
    activeDot={false}
    connectNulls={true}  // WICHTIG: Linien durchziehen!
    isAnimationActive={false}
  />
  ```
  - **Commit:** `fix: enable connectNulls for continuous lines`

#### Task 5: Edge Cases & Validierung

- [ ] **Schaltjahre berücksichtigen**
  - Februar: 28 oder 29 Tage?
  - Monatswechsel korrekt handhaben
  - **Commit:** `fix: handle leap years in month tick generation`

- [ ] **Zeitzonenwechsel**
  - Sommerzeit/Winterzeit (MESZ/MEZ)
  - Timestamps immer in UTC?
  - **Commit:** `fix: ensure timezone consistency in timestamp conversion`

- [ ] **Daten außerhalb Ticks-Range**
  - Was wenn Eintrag vor erstem Tick oder nach letztem Tick?
  - domain={['dataMin', 'dataMax']} sollte das handhaben
  - Testing mit Edge-Daten
  - **Commit:** `test: verify data points outside tick range`

- [ ] **Leere Daten**
  - Verhalten bei 0 Einträgen im Zeitraum?
  - Ticks trotzdem anzeigen (leerer Chart)
  - **Commit:** `fix: show ticks even with no data points`

#### Task 6: Testing

- [ ] **Unit Tests: Tick-Generatoren**
  - Test generateDayTicks mit verschiedenen Daten
  - Test generateWeekTicks über Monatsgrenzen
  - Test generateMonthTicks für Feb (28/29 Tage)
  - Test 6M/Year Generatoren über Jahreswechsel
  - **Commit:** `test: add unit tests for tick generators`

- [ ] **Integration Tests: Chart Rendering**
  - Test mit 1 Datenpunkt
  - Test mit Lücken (z.B. nur Mo + Fr)
  - Test mit 50+ Datenpunkten
  - Test alle Zeiträume (T/W/M/6M/J)
  - **Commit:** `test: integration tests for fixed ticks chart`

- [ ] **Visual Regression Tests**
  - Screenshots von Charts mit festen Ticks
  - Vergleich vorher/nachher
  - Manuelle Review erforderlich
  - **Commit:** `test: visual regression for fixed ticks`

### Performance-Überlegungen

**VORTEIL gegenüber vollständigem Zeitraster:**
- Wir generieren nur TICKS (4-7 Timestamps)
- chartData bleibt sparse (nur echte Einträge)
- KEINE NULL-Werte für fehlende Tage
- Performance-Impact: Minimal (7 Ticks vs. 31 NULL-Werte)

**Beispiel Monat:**
- Alte Lösung A (vollständig): 31 Datenpunkte (26 davon NULL)
- Neue Lösung: 7 Ticks + 5 echte Datenpunkte
- Recharts Performance: 5 Punkte << 31 Punkte

### Best Practices Integration

**ALIGNED MIT:**
- ✅ Apple Health Design (stride(by:) Muster)
- ✅ Recharts Community Workaround (Issue #1052)
- ✅ D3.js Best Practice (numerische Achsen für Time-Series)
- ✅ Datawrapper UX (connectNulls=true für Klarheit)

**ABWEICHUNGEN VON URSPRÜNGLICHER SPEC:**
- M-Ansicht: Empfehlung 7 Ticks statt 4 (bessere UX)
- Grund: 30 Datenpunkte mit nur 4 Ticks = 26 Punkte ohne Label
- Alternative: User-Einstellung für 4 vs 7 Ticks?

### Aufwandsschätzung

- **Task 1 (Timestamps):** 30 Min
- **Task 2 (Tick-Generatoren):** 1.5h
- **Task 3 (Formatter):** 1h
- **Task 4 (XAxis Integration):** 1h
- **Task 5 (Edge Cases):** 1h
- **Task 6 (Testing):** 1.5h

**GESAMT:** ~6.5 Stunden

### Erfolgs-Kriterien

- [ ] X-Achse zeigt IMMER feste Ticks (unabhängig von Daten)
- [ ] Datenpunkte erscheinen positionsgenau zwischen Ticks
- [ ] Linien verbinden alle Punkte (auch über Lücken)
- [ ] Alle 5 Zeiträume (T/W/M/6M/J) funktionieren
- [ ] Keine Performance-Regression
- [ ] Mobile & Desktop kompatibel
- [ ] Dark Mode funktioniert

---

---

## 📊 Phase 6.5: ApexCharts Migration - Native Time-Series Support (EMPFOHLEN)
**Branch:** `feature/apexcharts-migration`  
**Status:** 🟢 GEPLANT (Alternative zu Phase 6.4)  
**Priorität:** HOCH - Vereinfacht Time-Series Implementierung massiv

### Entscheidungsgrundlage

**RECHERCHE-ERGEBNISSE (09.02.2026):**

Nach intensiver Recherche zu Chart-Libraries für React PWA wurde ApexCharts als bessere Alternative zu Recharts identifiziert:

**VERGLEICH: RECHARTS vs APEXCHARTS**

| Kriterium | Recharts | ApexCharts | Gewinner |
|-----------|----------|------------|-----------|
| Bundle Size | 95KB ⭐⭐⭐⭐⭐ | 130KB ⭐⭐⭐☆☆ | Recharts (+35KB) |
| Time-Series Native | ⭐☆☆☆☆ Workaround | ⭐⭐⭐⭐⭐ Nativ | **ApexCharts** |
| Feste Ticks | ⭐⭐☆☆☆ Timestamps | ⭐⭐⭐⭐⭐ Categories | **ApexCharts** |
| Mobile-First | ⭐⭐⭐⭐☆ Gut | ⭐⭐⭐⭐⭐ Excellent | **ApexCharts** |
| Dokumentation | ⭐⭐⭐☆☆ Gut | ⭐⭐⭐⭐⭐ Excellent | **ApexCharts** |
| **GESAMT (gewichtet)** | 3.0/5 | **4.1/5** | **ApexCharts** |

**HAUPTVORTEIL:**
- ✅ **Keine Timestamps-Konvertierung** nötig (ISO-Dates direkt)
- ✅ **Positionsgenaue Datenpunkte** automatisch
- ✅ **Feste Ticks** out-of-the-box
- ✅ **Responsive Breakpoints** eingebaut
- ✅ **Synced Charts** (für Funktionswerte später)

**TRADE-OFF:**
- ⚠️ Bundle +35KB größer (130KB vs 95KB)
- ⚠️ Options-Objekt statt JSX (weniger "React-native")
- ✅ Für PWA akzeptabel (<200KB)
- ✅ Gleicher Implementierungs-Aufwand (6h) wie Recharts-Workaround

**ENTSCHEIDUNG:**
→ ApexCharts wird als bessere Lösung empfohlen, da es native Time-Series Support bietet und die Komplexität der Timestamps-Konvertierung eliminiert.

---

### Migrations-Plan: Recharts → ApexCharts

#### Phase 1: Installation & Proof-of-Concept (1.5h)
**Ziel:** ApexCharts installieren und grundlegende Funktionalität testen

- [ ] **Installation**
  ```bash
  npm install react-apexcharts apexcharts
  ```
  - **Commit:** `chore: install react-apexcharts and apexcharts`

- [ ] **Proof-of-Concept Chart erstellen**
  - Neue Datei: `src/components/charts/ApexLineChart.tsx`
  - Test mit 1 Template, 1 Zeitraum (W)
  - Verifizieren: ISO-Dates funktionieren (keine Timestamps!)
  - **Commit:** `feat: create ApexLineChart proof-of-concept component`

- [ ] **Feste Ticks testen**
  ```tsx
  xaxis: {
    type: 'datetime',
    categories: ['2026-02-03', '2026-02-04', ...],  // ISO-Dates!
    labels: { formatter: (val) => formatWeekday(val) }
  }
  ```
  - Verifizieren: Datenpunkte erscheinen positionsgenau
  - **Commit:** `test: verify fixed ticks with ISO dates work correctly`

#### Phase 2: Data Layer Migration (2h)
**Ziel:** chartData für ApexCharts Format anpassen

- [ ] **Series-Format anpassen**
  ```tsx
  // VORHER (Recharts):
  chartData: { date: '2026-02-04', template_1_avg: 7, template_2_avg: 5 }
  
  // NACHHER (ApexCharts):
  series: [
    { name: 'Template 1', data: [{ x: '2026-02-04', y: 7 }] },
    { name: 'Template 2', data: [{ x: '2026-02-04', y: 5 }] }
  ]
  ```
  - Funktion: `convertToApexSeries(dailyPainData, chartConfig)`
  - **Datei:** `src/utils/dashboardData.ts`
  - **Commit:** `feat: add convertToApexSeries function for data transformation`

- [ ] **Categories Array generieren**
  ```tsx
  function generateCategories(timeRange: TimeRange, now: Date): string[] {
    // Gibt ISO-Date Strings zurück, z.B. ['2026-02-03', '2026-02-04', ...]
  }
  ```
  - **Datei:** `src/utils/dashboardData.ts`
  - **Commit:** `feat: add generateCategories function for x-axis ticks`

- [ ] **X-Axis Formatter**
  ```tsx
  function formatXAxisLabel(value: string, timeRange: TimeRange): string {
    const date = new Date(value);
    switch(timeRange) {
      case 'T': return format(date, 'HH') + 'h';  // 0h, 8h, 16h, 24h
      case 'W': return format(date, 'EEE', { locale: de });  // Mo, Di, ...
      case 'M': return format(date, 'd') + '.';  // 1., 10., 20., 31.
      // ...
    }
  }
  ```
  - **Datei:** `src/utils/dashboardData.ts`
  - **Commit:** `feat: add formatXAxisLabel function for tick formatting`

#### Phase 3: DashboardView Migration (2h)
**Ziel:** ChartContainer durch ApexCharts ersetzen

- [ ] **ApexCharts Options konfigurieren**
  ```tsx
  const chartOptions = useMemo(() => ({
    chart: {
      id: 'pain-chart',
      type: 'line',
      height: 350,
      toolbar: { show: false },
      background: 'transparent'
    },
    xaxis: {
      type: 'datetime',
      categories: generateCategories(timeRange, now),
      labels: {
        formatter: (val) => formatXAxisLabel(val, timeRange),
        style: { colors: 'hsl(var(--muted-foreground))' }
      },
      axisBorder: { color: 'hsl(var(--border))' },
      axisTicks: { color: 'hsl(var(--border))' }
    },
    yaxis: {
      min: 0,
      max: 10,
      tickAmount: 5,
      labels: { style: { colors: 'hsl(var(--muted-foreground))' } },
      axisBorder: { show: true, color: 'hsl(var(--border))' }
    },
    stroke: { width: 2, curve: 'smooth' },
    markers: {
      size: 6,
      strokeWidth: 2,
      strokeColors: '#fff',
      hover: { size: 8 }
    },
    grid: {
      borderColor: 'hsl(var(--border))',
      strokeDashArray: 4
    },
    tooltip: {
      theme: 'dark',
      x: { format: 'dd.MM.yyyy' }
    },
    legend: { show: false },
    colors: Object.values(chartConfig).map(t => t.color)
  }), [timeRange, now, chartConfig]);
  ```
  - **Datei:** `src/pages/DashboardView.tsx`
  - **Commit:** `feat: configure ApexCharts options with theme integration`

- [ ] **Chart Component einbinden**
  ```tsx
  import Chart from 'react-apexcharts';
  
  <Chart
    type="line"
    series={apexSeries}
    options={chartOptions}
    height={350}
  />
  ```
  - Recharts ChartContainer ersetzen
  - **Commit:** `feat: replace Recharts with ApexCharts in DashboardView`

- [ ] **Template Toggle Integration**
  - Filter funktioniert über series Array
  - Nur aktivierte Templates in series aufnehmen
  - **Commit:** `feat: integrate template toggle with ApexCharts series`

#### Phase 4: Styling & Theme Integration (1.5h)
**Ziel:** Dark Mode, Template-Farben, Custom Dots

- [ ] **Dark Mode Support**
  ```tsx
  const isDarkMode = document.documentElement.classList.contains('dark');
  
  chart: {
    background: 'transparent',
    foreColor: isDarkMode ? '#e5e7eb' : '#374151'
  },
  theme: {
    mode: isDarkMode ? 'dark' : 'light'
  }
  ```
  - **Commit:** `feat: add dark mode support to ApexCharts`

- [ ] **Template-Farben aus chartConfig**
  ```tsx
  colors: Object.values(chartConfig)
    .filter(t => enabledTemplates.includes(t.id))
    .map(t => t.color)
  ```
  - **Wichtig:** Pro Template EINE feste Farbe (keine Rot/Grün Kodierung!)
  - **Commit:** `feat: apply template colors from chartConfig to series`

- [ ] **Custom Dots (hohle Kreise)**
  ```tsx
  markers: {
    size: 6,
    strokeWidth: 2,
    strokeColors: '#fff',  // Weißer Rand
    fillOpacity: 0,  // Hohl
    hover: { size: 8 }
  }
  ```
  - **Commit:** `feat: configure hollow circle markers for data points`

- [ ] **Event-Icons (später als Annotations)**
  - Vorbereitung für Phase 6.1 Event-Icons
  - ApexCharts unterstützt `annotations.points`
  - **Commit:** `docs: add notes for future event-icons implementation`

#### Phase 5: Alle Zeiträume implementieren (1.5h)
**Ziel:** T/W/M/6M/J mit korrekten Ticks

- [ ] **TAG (T): 0h, 8h, 16h, 24h**
  ```tsx
  categories: [
    '2026-02-09T00:00:00',
    '2026-02-09T08:00:00',
    '2026-02-09T16:00:00',
    '2026-02-09T24:00:00'
  ]
  ```
  - **Commit:** `feat: implement day view with hourly ticks`

- [ ] **WOCHE (W): Mo, Di, Mi, Do, Fr, Sa, So**
  ```tsx
  categories: generateWeekDates(mondayOfWeek)  // 7 ISO-Dates
  formatter: (val) => format(new Date(val), 'EEE', { locale: de })
  ```
  - **Commit:** `feat: implement week view with weekday ticks`

- [ ] **MONAT (M): 1., 5., 10., 15., 20., 25., 31.**
  - 7 Ticks für bessere Lesbarkeit (statt 4)
  - Dynamisch an Monatslänge anpassen
  - **Commit:** `feat: implement month view with day-of-month ticks`

- [ ] **6 MONATE (6M): Monatskürzel**
  ```tsx
  categories: generateMonthStarts(6)  // Erster jedes Monats
  formatter: (val) => format(new Date(val), 'MMM', { locale: de })
  ```
  - **Commit:** `feat: implement 6-month view with month abbreviation ticks`

- [ ] **JAHR (J): Jeden 2. Monat**
  ```tsx
  categories: ['2025-03-01', '2025-05-01', '2025-07-01', ...]  // Alle 2 Monate
  ```
  - **Commit:** `feat: implement year view with bi-monthly ticks`

#### Phase 6: Responsive & Mobile Optimierung (1h)
**Ziel:** Breakpoints, Touch-Events, Mobile UX

- [ ] **Responsive Breakpoints**
  ```tsx
  responsive: [
    {
      breakpoint: 768,
      options: {
        chart: { height: 300 },
        xaxis: { labels: { rotate: -45 } }
      }
    }
  ]
  ```
  - **Commit:** `feat: add responsive breakpoints for mobile devices`

- [ ] **Touch-Events optimieren**
  - ApexCharts hat native Touch-Support
  - Zoom/Pan optional aktivierbar
  - **Commit:** `test: verify touch interactions on mobile devices`

- [ ] **iPhone SE Kompatibilität**
  - Testen auf kleinstem iOS Device
  - Font-Sizes anpassen falls nötig
  - **Commit:** `fix: optimize chart for small mobile screens (iPhone SE)`

#### Phase 7: Testing & Cleanup (1.5h)
**Ziel:** Alle Zeiträume testen, Recharts entfernen

- [ ] **Functionality Tests**
  - Alle Zeiträume (T/W/M/6M/J)
  - Template-Toggle
  - Time-Range Wechsel
  - Lücken in Daten (connectNulls)
  - **Commit:** `test: verify all time ranges and features work correctly`

- [ ] **Performance Tests**
  - Mit 100+ Datenpunkten
  - Bundle Size Analyse
  - Mobile Performance
  - **Commit:** `test: verify performance with large datasets`

- [ ] **Visual Regression Tests**
  - Screenshots: Desktop & Mobile
  - Dark Mode & Light Mode
  - Vergleich mit altem Design
  - **Commit:** `test: visual regression tests for ApexCharts migration`

- [ ] **Recharts Dependencies entfernen**
  ```bash
  npm uninstall recharts
  ```
  - Alte ChartContainer Komponente löschen
  - Imports aufräumen
  - **Commit:** `chore: remove Recharts dependencies and old components`

- [ ] **shadcn/ui Chart Components bewerten**
  - Prüfen ob shadcn/ui chart components noch benötigt
  - Falls nein: Auch entfernen
  - **Commit:** `chore: cleanup unused chart-related components`

---

### WICHTIG: Template-Farben (User-bestätigt)

**KEINE Rot/Grün-Kodierung für Schmerzwerte!**
- ✅ Jedes Template behält seine eigene Farbe (aus `chartConfig`)
- ✅ Template 1 = Farbe A, Template 2 = Farbe B, etc.
- ❌ KEINE Umfärbung basierend auf Wert (0=grün, 10=rot)

**Beispiel:**
```tsx
// Template "Kopfschmerz" = #ef4444 (rot) → bleibt rot
// Template "Rückenschmerz" = #3b82f6 (blau) → bleibt blau
colors: ['#ef4444', '#3b82f6', '#10b981']  // Aus chartConfig
```

---

### VORBEREITUNG: Funktionswerte (Phase 6.2 später)

**JETZT SCHON BERÜCKSICHTIGEN:**
- ApexCharts unterstützt **Synced Charts** perfekt
- Später: 2. Chart für Funktionswerte mit `chart.group: 'health-metrics'`
- Hover in einem Chart → Tooltip in beiden!

**FARBSCHEMA FÜR FUNKTIONSWERTE (SPÄTER):**
- ✅ **Gleiche Template-Farben** wie Schmerzwerte
- ✅ Template "Beweglichkeit" nutzt gleiche Farbe wie in Schmerz-Chart
- ❌ KEINE invertierten Farben (kein Grün bei hohen Werten)
- ❌ KEINE reversed Y-Achse

**Beispiel (später):**
```tsx
// Schmerz-Chart: Template "Knie" = #8b5cf6 (lila)
<Chart series={painSeries} options={{ colors: ['#8b5cf6'] }} />

// Funktions-Chart: Template "Knie Beweglichkeit" = #8b5cf6 (gleiche Farbe!)
<Chart series={functionSeries} options={{ colors: ['#8b5cf6'] }} />
```

**OPTIONALE OVERLAY-VARIANTE (ZUKUNFT):**
- Area Chart oder Bar Chart als Overlay
- Funktion im Hintergrund, Schmerz im Vordergrund
- ApexCharts `chart.type: 'line'` kombiniert mit `series[].type: 'area'`
- **Nicht jetzt implementieren, nur vorbereiten!**

---

### Aufwandsschätzung

| Phase | Aufgabe | Zeit |
|-------|---------|------|
| 1 | Installation & PoC | 1.5h |
| 2 | Data Layer Migration | 2h |
| 3 | DashboardView Migration | 2h |
| 4 | Styling & Theme | 1.5h |
| 5 | Alle Zeiträume | 1.5h |
| 6 | Responsive & Mobile | 1h |
| 7 | Testing & Cleanup | 1.5h |
| **GESAMT** | | **11h** |

**VERGLEICH:**
- Recharts Workaround (Phase 6.4): 6.5h
- ApexCharts Migration: 11h
- **Mehraufwand: +4.5h**

**ABER:**
- ✅ Native Time-Series = einfacherer Code
- ✅ Keine Timestamps-Konvertierung
- ✅ Bessere Wartbarkeit langfristig
- ✅ Vorbereitet für Funktionswerte (Synced Charts)
- ✅ Bessere Mobile-Unterstützung

---

### Erfolgs-Kriterien

- [ ] X-Achse nutzt ISO-Dates (KEINE Timestamps)
- [ ] Feste Ticks für alle Zeiträume (T/W/M/6M/J)
- [ ] Datenpunkte erscheinen positionsgenau
- [ ] Template-Farben aus chartConfig
- [ ] Linien immer verbunden (connectNulls)
- [ ] Dark Mode funktioniert
- [ ] Mobile responsive (iPhone SE bis iPad)
- [ ] Performance: <300ms Render-Zeit
- [ ] Bundle Size: <200KB (aktuell ~130KB ApexCharts)
- [ ] Alle Tests bestanden

---

### Migration vs Recharts-Fix: Entscheidungshilfe

**WÄHLE APEXCHARTS (Phase 6.5) WENN:**
- ✅ Native Time-Series Priorität
- ✅ Einfacherer Code wichtiger als Bundle Size
- ✅ Funktionswerte (Phase 6.2) bald geplant
- ✅ +4.5h Mehraufwand akzeptabel
- ✅ Langfristige Wartbarkeit wichtig

**WÄHLE RECHARTS-FIX (Phase 6.4) WENN:**
- ✅ Bundle Size kritisch (<100KB absolut nötig)
- ✅ Kein Breaking Change gewünscht
- ✅ Team kennt Recharts bereits
- ✅ Migration-Risiko vermeiden

**EMPFEHLUNG:** ApexCharts (Phase 6.5) ✅

---

**Letzte Aktualisierung:** 09.02.2026  
**Aktueller Stand:** Phase 5 komplett ✅, Phase 6.4 (Recharts-Fix) geplant, Phase 6.5 (ApexCharts) EMPFOHLEN  
**Nächster Schritt:** Entscheidung treffen: Phase 6.4 (Recharts) ODER Phase 6.5 (ApexCharts)
