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

**Letzte Aktualisierung:** 06.02.2026  
**Aktueller Stand:** Phase 5 komplett ✅, Phase 6.1 (Dashboard Performance) in Progress  
**Nächster Schritt:** Phase 6.1 - Event-Tooltip, Dots ausblenden, Adaptive Aggregation
