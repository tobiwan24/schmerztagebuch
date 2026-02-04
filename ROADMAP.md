# Schmerztagebuch PWA 2.0 - Roadmap

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
- [x] Dashboard Page (shadcn/ui Legacy)
- [x] Pain Data Aggregation
- [x] Line Chart mit Multi-Template Support
- [x] Event/Arztbesuch Tracking
- [x] Event Icons auf Chart-Datenpunkten
- [x] Template Toggle (Sichtbarkeit)
- [x] Zeitraum-Filter (7d/1m/3m/all)
- [x] DatePicker Range-Support (Zeiträume)

## ✅ Phase 4: Layout-Umstrukturierung & Glassmorphismus (KOMPLETT)

### A) DiaryView: Glassmorphismus + Pull-to-Reveal ✅ KOMPLETT
**Status:** Vollständig umgesetzt
- [x] Bottom-Nav als glassmorphe Pill (fixed bottom, border-radius 9999px)
  - Template-Icons als runde Buttons (2rem × 2rem)
  - Aktiver Tab: fettes Icon + schwarzer Unterstrich
  - Horizontal scrollbar (ohne sichtbare Scrollbar)
  - Höhe: 3rem (48px)
- [x] Floating Buttons oben rechts (Menu & Save)
  - Größe: 2.5rem × 2.5rem (40px)
  - Glassmorphismus-Styling (blur + rgba background)
  - Save-Button: Grüner Haken + grüner Glow + grüner Hintergrund
  - Animation: slideInRight wenn Save erscheint
- [x] Scrollbares Layout
  - Content Area: flex-1 overflow-y-auto
  - Smooth scroll-behavior
  - Auto-Scroll nach oben bei Template-Wechsel
  - Auto-Scroll nach oben nach Speichern
- [x] Pull-to-Reveal Personalisieren-Button
  - Touch (Mobile): Nach oben ziehen (80px) am Ende → Button erscheint
  - Touch (Mobile): Nach unten ziehen (80px) → Button verschwindet  
  - Scroll (Desktop): Nach unten scrollen (270px akkumuliert) am Ende → Button erscheint
  - Scroll (Desktop): Nach oben scrollen (270px akkumuliert) → Button verschwindet
  - Slide-Up/Slide-Down Animationen (0.4s)
  - Haptic Feedback (vibrate: 50ms erscheinen, 30ms verschwinden)
  - Indigo Border + Glow-Animation
  - Führt direkt zum Template-Editor der aktuellen Template via `onEditTemplate`
  - **Technische Lösung - Pull-to-Reveal Button Problem:**
    - **Problem:** `useEffect` lief bevor `ref={contentRef}` attached wurde
    - **Symptom:** "Container not found!" 4x - Events wurden nie attached
    - **Root Cause:** React Lifecycle - useEffect läuft vor Ref-Attachment beim ersten Render
    - **Lösung:** 
      1. `useLayoutEffect` statt `useEffect` (läuft nach DOM-Update, vor Paint)
      2. `setTimeout(100ms)` um sicherzustellen, dass Ref definitiv attached ist
      3. `showPersonalizeBtnRef` für State-Zugriff in Event Handlers (löst Closure-Problem mit Dependencies)
      4. `touchAction: 'manipulation'` auf Container-Element (überschreibt `body { touch-action: pan-y }`)
    - **Zeile:** DiaryView.tsx:78-190
    - **Commit:** Fix Pull-to-Reveal Button - useLayoutEffect + setTimeout
- [x] Card-Border entfernt (keine gemeinsame Umrandung für Bausteine)
- [x] Mobile Touch-Optimierung

### B) Template-Editor: Direkter Einstieg & Glassmorphismus ✅ KOMPLETT
**Status:** Vollständig umgesetzt
- [x] Direkt-Einstieg implementiert
  - Prop `initialTemplateId?: number` in EditorMode vorhanden
  - useEffect lädt Template direkt bei initialTemplateId
  - DiaryView Integration via `onEditTemplate` callback
  - Kein Umweg über Template-Liste
- [x] Floating Buttons oben rechts (Glassmorphismus)
  - Plus-Button (neues Template) - links
  - Trash-Button (Template löschen) - mitte  
  - Save-Button (grüner Glow bei Änderungen) - rechts
  - Größe: 2.5rem × 2.5rem
  - Konsistentes Design mit DiaryView
- [x] Header vereinfacht
  - Breadcrumb-Style: "← Zurück zum Tagebuch"
  - Führt direkt zurück zu DiaryView
  - Kein Sandwich-Menü mehr
- [x] Navigation bereinigt
  - Direkter Rückweg zur DiaryView
  - Keine Template-Liste als Zwischenschritt

## 🎨 Phase 4.5: UI & Workflow Verbesserungen (TODO)
**Priorität:** MITTEL - UX-Optimierungen für bessere Bedienbarkeit

### Navigation & Menü:
- [ ] **"Personalisieren" Menüeintrag im Hamburger-Menü**
  - Neuer Eintrag zwischen "Dashboard" und "Einstellungen"
  - Icon: Paintbrush oder Edit
  - Führt direkt zum Template-Editor (ohne initialTemplateId = Template-Auswahl)
  - Alternative zum Pull-to-Reveal für Desktop/bewusste Nutzer

### Template-Editor: Workflow für neuen Baustein:
- [ ] **Optimierter Block-Hinzufügen Workflow**
  1. Nutzer klickt "Baustein" in BlockPalette
  2. Neuer Block erscheint **direkt im Editor**, unterhalb existierender Blocks
  3. **Überschrift visuell als Pflichtfeld markiert**:
     - Roter Rahmen oder rot pulsierender Glow
     - Visueller Hinweis "Überschrift erforderlich"
  4. **Auto-Focus**: Cursor springt direkt ins Überschrift-Feld
  5. **Solange Überschrift leer**:
     - Block kann nicht gespeichert werden
     - Block kann nicht verschoben werden (Drag disabled)
     - Optional: Tooltip "Überschrift erforderlich"
  6. **Sobald Überschrift ausgefüllt**:
     - Rot-Markierung verschwindet
     - Block ist vollständig editierbar und verschiebbar
     - Normaler grauer Rahmen

### Template-Editor: Bulk-Actions:
- [ ] **Global Toggles neben Icon-Selection**
  - **"Alle Werte in Diagramme"** Toggle (On/Off)
    - Aktiviert/Deaktiviert `dashboard.enabled` für alle Slider/BodyMap Blocks
    - Visuelles Feedback: Anzahl der betroffenen Blocks
  - **"Alle Überschriften ausblenden"** Toggle (On/Off)
    - Aktiviert/Deaktiviert `hideLabelInDiary` für alle Blocks
    - Hilfreich für minimalistisches Diary-Layout
  - Position: Unter TemplateStylePicker, vor BlockPalette
  - Design: Kompakte Switches mit Icons + Label

## 🎯 Phase 5: Dashboard v2 mit shadcn/ui Charts (NÄCHSTER SCHRITT)
**Priorität:** HOCH - Modernisierung & Verbesserung der Datenvisualisierung

### Ziele:
- Moderneres, übersichtlicheres Dashboard
- Bessere Chart-Performance
- Konsistenteres Design mit shadcn/ui
- Legacy Dashboard als Fallback behalten

### TODO:
- [ ] **Neue DashboardViewV2.tsx erstellen**
  - Neue Datei `src/pages/DashboardViewV2.tsx`
  - Import von shadcn/ui Chart-Komponenten
  - ChartContainer, ChartConfig, ChartTooltip
  
- [ ] **Chart-Konfiguration**
  - Multi-Template Line Charts mit ChartConfig
  - Bessere Farbzuordnung pro Template
  - Responsive Layout
  - Interaktive Tooltips
  
- [ ] **Event-Visualisierung**
  - Event Marker Integration in neue Charts
  - Bessere Darstellung von Arztbesuchen/Events
  - Hover-States für Event-Details
  
- [ ] **Filter & Controls**
  - Zeitraum-Filter (7d/1m/3m/all)
  - Template Visibility Toggle
  - DatePicker für Custom Ranges
  
- [ ] **Navigation & Toggle**
  - Toggle zwischen DashboardViewV2 und Legacy
  - Settings-Option für Default-Dashboard
  - Smooth Transitions
  
- [ ] **Testing & Refinement**
  - Performance-Tests mit großen Datenmengen
  - Mobile Responsiveness prüfen
  - UX-Feedback einarbeiten

### Implementierungs-Strategie:
1. DashboardViewV2.tsx parallel zu DashboardView.tsx entwickeln
2. Legacy Dashboard bleibt verfügbar (DashboardViewLegacy.tsx)
3. A/B-Toggle in Settings für User-Testing
4. Nach erfolgreicher Testphase: v2 als Standard setzen

## 🧹 Phase 6: Code Cleanup & Refactoring (BACKLOG)

### Ungenutzte Dateien entfernen:
- [ ] `src/styles/utilities.css` (leer, nur Kommentar)
- [ ] `src/components/TemplateEditor.tsx` (leer, nicht verwendet)
- [ ] `filterEntriesByTimeRange` in `dashboardData.ts` (doppelt vorhanden, nicht mehr genutzt)

### CSS Konsolidierung:
- [ ] Prüfen ob `layout.css` noch nötig ist (viele Klassen nicht mehr verwendet)
- [ ] Prüfen ob `Header.tsx` Komponente noch irgendwo verwendet wird
- [ ] `blocks.css` durchgehen auf ungenutzte Klassen

### Code-Qualität:
- [ ] TypeScript: Stricter types für Block.value
- [ ] ESLint Warnings durchgehen
- [ ] Duplicate Code identifizieren und refactoren
- [ ] Console.logs entfernen (außer echte Error-Logs)

## 🔮 Phase 7: Future Features (BACKLOG)
- [ ] BodyMapBlock Implementation (vollständig)
- [ ] Function Tracking (separate Charts für Funktions-Tracking)
- [ ] Correlation Analysis (Events vs Pain)
- [ ] Chart Export (Image/PDF)
- [ ] Custom Date Range Picker (erweitert)
- [ ] Trend Analysis (ML-basiert)
- [ ] Medication Tracking
- [ ] Multi-Language Support (i18n)
- [ ] Cloud Sync (optional, mit E2E-Verschlüsselung)
- [ ] Offline PWA Enhancements (besseres Caching)
- [ ] Data Import/Export (CSV, JSON)

## 🚀 Phase 8: App Redesign 2.0 (LANGFRISTIGE VISION)
**Priorität:** NIEDRIG - Weiterführende Ideen für Major Update

### Neue Startseite (Home Screen):
- [ ] **Hallo-Screen Design**
  - Begrüßung mit User-Name (falls gesetzt)
  - Mittig zentrierte Template-Buttons (große Cards mit Icon + Name)
  - Grid-Layout für Template-Übersicht
  - Visuell ansprechender als aktuelle Bottom-Nav
  
- [ ] **Navigation umstrukturiert**
  - Template-Buttons zentral auf Startseite
  - Bottom-Nav nur in DiaryView sichtbar (für schnellen Template-Wechsel)
  - Weitere Pages (History, Dashboard, Settings) als kleinere Buttons unten
  
- [ ] **Dashboard-Preview auf Startseite**
  - Bei Voll-Verschlüsselung: Direkte Trend-Anzeige auf Startseite
  - Mini-Charts/Sparklines für schnellen Überblick
  - Klick führt zu vollständigem Dashboard
  - Nur bei aktivierter Verschlüsselung (Datenschutz)
  
- [ ] **Workflow-Änderung**
  - Startseite → Template auswählen → DiaryView öffnet sich
  - Bottom-Nav erscheint nur in DiaryView für Template-Wechsel
  - Zurück-Button führt zur Startseite (nicht zur Template-Liste)

### Design-Konzept:
- iOS/Android inspirierte Startseite
- Cards mit Glassmorphismus für Templates
- Smooth Transitions zwischen Views
- Konsistentes Icon-Design durchgängig

## 🐛 Known Issues / Tech Debt
- [ ] Encryption: Event/Pain extraction in dashboardData.ts noch nicht implementiert (decryptFn TODO)
- [ ] Git repository außerhalb iCloud (bereits gelöst, hier zur Dokumentation)
- [ ] TypeScript: Stricter types für Block.value
- [ ] Performance: Große Entry-Mengen (>1000) können Charts verlangsamen

---

**Letzte Aktualisierung:** 04.02.2026
**Aktueller Stand:** Phase 4 komplett ✅, Phase 4.5 & 5 als nächstes
**Nächster Schritt:** UI Verbesserungen (Phase 4.5) oder Dashboard v2 (Phase 5)
