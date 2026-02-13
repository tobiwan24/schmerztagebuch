# Schmerztagebuch PWA 2.0 - Roadmap

---

## 🔄 Git Workflow & Versionierung

**WICHTIG:** Seit 04.02.2026 nutzen wir Git mit Feature-Branch Workflow!

### Branch-Struktur:
- **`main`** - Produktions-Stand (stabil, nur Merges von develop)
- **`develop`** - Haupt-Entwicklungs-Branch
- **`feature/*`** - Feature-Branches (z.B. `feature/editor-ux-improvements`)
- **`bugfix/*`** - Bugfix-Branches (z.B. `bugfix/touch-scrolling`)
- **`hotfix/*`** - Dringende Fixes auf main

### Commit-Konventionen (Conventional Commits):
- `feat:` - Neues Feature
- `fix:` - Bugfix
- `refactor:` - Code-Umstrukturierung
- `style:` - CSS/UI Änderungen
- `docs:` - Dokumentation
- `test:` - Tests
- `chore:` - Build, Dependencies, Config

---

## ✅ ABGESCHLOSSENE PHASEN

### Phase 1-4: Core Features & Layout (KOMPLETT)
- [x] Database Schema (IndexedDB/Dexie)
- [x] Template System mit Blocks
- [x] DiaryView mit Glassmorphismus
- [x] Template-Editor mit Drag & Drop

### Phase 5: Dashboard UI (KOMPLETT - 12.02.2026)
- [x] ApexCharts Migration
- [x] Period-over-Period Trendberechnung
- [x] Responsive Datumsanzeige
- [x] Template-Legend zentriert
- [x] Chart-Container flexible Height
- [x] DB Version 11

---

## 🔥 PHASE 6: TEMPLATE-EDITOR UX IMPROVEMENTS (HIGH PRIO)

**Kontext:** EditorMode ist Bearbeitungsmodus (nicht regelmäßig genutzt), DiaryView ist Standard-Nutzung  
**Basis:** UX-Analyse vom 12.02.2026 (12 Probleme identifiziert, 15 Verbesserungen erarbeitet)  
**Prinzip:** Template-Editor hat KEINE inhaltliche Hierarchie - User bestimmt Flow durch Reihenfolge (Top → Down)

### 6.1: Quick Wins (1h 15min) ✅ KOMPLETT
**Branch:** `feature/editor-quick-wins`
**Status:** Abgeschlossen (13.02.2026)

- [x] **Touch Target Größe erhöhen**
  - Alle Icon-Buttons: 44x44px (Apple HIG Standard)
  - Button-Spacing: 1px → 12px
  - Klasse: `.btn-touch-target` in components.css
  - **Commit:** `style: increase touch target sizes to 44x44px`

- [x] **Collapsible Block Palette**
  - Palette nur bei Bedarf einblenden (spart Platz)
  - Floating "+" Button statt permanente Palette
  - Modal mit BlockPalette beim Klick
  - Grid 4→2 Spalten (optimiert für Modal-Breite)
  - Auto-Close nach Block-Auswahl
  - **Commit:** `feat: make block palette collapsible with modal`

### 6.2: Visuelle Trennung & Bulk-Actions (2.5h) ✅ KOMPLETT
**Branch:** `feature/editor-visual-structure`
**Status:** Abgeschlossen (13.02.2026)

**WICHTIG:** Keine inhaltliche Hierarchie bei Blocks - alle Blocks gleich wichtig, User-Reihenfolge = Flow

- [x] **Template-Settings einklappbar & Bulk-Actions integriert**
  - Collapsible Header mit Chevron-Icon
  - Template-Name direkt editierbar (kein Label)
  - Template-Icon: Bottom-Bar Style (3.5rem, Glassmorphismus)
  - Bulk Actions inline: "Datenauswertung" + "Überschriften anzeigen"
  - Checkboxen 4x4px, touch-friendly
  - **Commit:** `feat: integrate bulk actions into collapsible template settings`

- [x] **Add-Block-Button: Personalisieren-Style**
  - Volle Breite, 2px grüner Border (#10b981)
  - 15% opacity Background, 25% on hover
  - Icon 18px, text-sm, font-medium
  - Wie "Seite personalisieren"-Button (DiaryView)
  - **Commit:** `feat: redesign add block button in personalize style`

- [x] **Spacing-System vereinheitlicht (16px)**
  - Template-Settings Card: `margin-bottom: 1rem` (16px)
  - Add-Block-Button Container: `margin-bottom + padding-bottom: 1rem` (16px)
  - Main Container: `space-y-4` (16px)
  - Blocks: `space-y-4` (16px)
  - Content Padding-Top: `calc(3.5rem + 1rem)` (Header 56px + 16px)
  - **Commit:** `style: unify spacing to 16px throughout editor`

- [x] **Border-Bottom Trennung**
  - Subtile Linie unter Add-Block-Button
  - Visuelle Trennung Header/Content
  - **Commit:** `style: add border separator below add block button`

- [x] **Color-Logik entfernt**
  - `onColorChange` Prop entfernt aus TemplateStylePicker
  - `handleColorChange` Funktion entfernt aus EditorMode
  - Nur noch Icon-Auswahl, keine Template-Farben mehr
  - **Commit:** `refactor: remove color logic from template settings`

- [x] **CSS-Klassen statt Inline-Styles**
  - `.template-icon-button` - Bottom-Bar Style (3.5rem, rund)
  - `.template-icon-button-inner` - Icon Container
  - `.add-block-button-container` - Container mit Border
  - `.add-block-button` - Personalisieren-Style in Grün
  - `.icon-picker-button` - Icon Picker Buttons (36x36px)
  - Alle Inline-Styles in CSS überführt (außer dynamische Farben)
  - **Commit:** `refactor: convert inline styles to CSS classes`

### 6.3: Block-Aktionen Vereinfachung (1.5h)
**Branch:** `feature/block-actions-simplified`

**Ziel:** Weniger permanente Buttons, schlanke PWA

**VARIANTE A (PRIMÄR - BESCHLOSSEN):**

- [ ] **Toggle "Erweiterte Ansicht" im Header**
  - Button im Header: "Einfach" / "Erweitert"
  - State: `showAdvancedActions` (boolean)
  - **Standard (Einfach):**
    - Nur Dashboard + Eye Toggle sichtbar
    - Edit/Delete via Context-Menu erreichbar
  - **Erweitert:**
    - ALLE Buttons erscheinen am rechten Rand der Blöcke
    - Edit + Delete Buttons zusätzlich sichtbar
  - **Aufwand:** 30 Min
  - **Commit:** `feat: add advanced view toggle for block actions`

- [ ] **Context-Menu für Edit/Delete**
  - Right-Click (Desktop) öffnet Context-Menu
  - Long-Press 500ms (Mobile) öffnet Context-Menu
  - Menu-Einträge:
    - "Bearbeiten" (Edit)
    - "Löschen" (Delete)
  - shadcn/ui ContextMenu Komponente
  - **Aufwand:** 45 Min
  - **Commit:** `feat: add context menu for block edit and delete`

- [ ] **Conditional Button Rendering**
  - Dashboard + Eye Toggle: Immer sichtbar
  - Edit + Delete: Nur bei `showAdvancedActions === true`
  - Button-Position: Rechter Rand (flex justify-end)
  - **Aufwand:** 15 Min
  - **Commit:** `feat: implement conditional button rendering based on view mode`

**VARIANTE B (FALLBACK - NOTIERT FÜR SPÄTERE ENTSCHEIDUNG):**

Sollte Variante A zu komplex werden oder User bevorzugt minimalistischeren Ansatz:
- KEINE permanenten Edit/Delete Buttons (auch nicht in Erweitert-Modus)
- NUR Context-Menu (Right-Click/Long-Press) für Edit/Delete
- Dashboard + Eye Toggle bleiben immer sichtbar
- **Vorteil:** Noch schlanker, minimaler Code
- **Nachteil:** Hidden Gesture (nicht sofort erkennbar)

**Status:** Notiert, nicht implementiert (Fallback falls Variante A nicht überzeugt)

### 6.4: Modal-System Vereinheitlichung (2h)
**Branch:** `refactor/modal-components`

**Problem:** 3 verschiedene Modal-Typen inkonsistent

- [ ] **Brainstorming: Modal-System**
  - Analyse aktueller Modal-Typen:
    1. Add Block Popup (kleines Modal)
    2. Block Options Modal (großes Modal)
    3. Dashboard Config Modal (separate Komponente)
  - BaseModal Komponente konzipieren
  - Shared Props & Styling definieren
  - Konsistente Patterns dokumentieren
  - **Aufwand:** 30 Min
  - **Commit:** `docs: document modal system refactoring plan`

- [ ] **BaseModal Komponente implementieren**
  - Gemeinsame BaseModal mit Props:
    - `size`: 'sm' | 'md' | 'lg'
    - `title`: string
    - `onClose`: () => void
  - Konsistente Close/Cancel Patterns
  - Keyboard Shortcuts (Escape = Close)
  - Konsistente Button-Positionen (rechts: Cancel, Primary)
  - Backdrop mit onClick-Close
  - **Aufwand:** 1h
  - **Commit:** `refactor: create unified BaseModal component`

- [ ] **Migration bestehender Modals**
  - Add Block Modal → BaseModal
  - Block Options Modal → BaseModal
  - Dashboard Config Modal → BaseModal
  - Props anpassen, Styles vereinheitlichen
  - **Aufwand:** 30 Min
  - **Commit:** `refactor: migrate existing modals to BaseModal`

### 6.5: Template-Switcher (45 Min)
**Branch:** `feature/template-switcher`

**BESCHLOSSEN:** Buttons (keine Swipe-Geste)

**Platz-Prüfung (durchgeführt):**
- iPhone SE (375px): ✅ 335px verfügbar ≥ 282px benötigt
- Android (360px): ✅ 320px verfügbar ≥ 282px benötigt
- Template-Name zu lang: Text-Overflow ellipsis

- [ ] **Navigation Buttons im Header**
  - Layout: `◀ [Template-Name] ▶ [×]`
  - Buttons nur sichtbar wenn `templates.length > 1`
  - Previous/Next Navigation (zyklisch: letztes → erstes)
  - Template-Name: Flexibel, text-overflow: ellipsis
  - **Aufwand:** 30 Min
  - **Commit:** `feat: add template navigation arrows in header`

- [ ] **Template Switch Logic**
  - State: `currentTemplateIndex`
  - `handlePrevious()`: Index - 1 (wrap to end)
  - `handleNext()`: Index + 1 (wrap to start)
  - Template laden: `setSelectedTemplate(templates[newIndex])`
  - Unsaved Changes Warning (falls aktiv)
  - **Aufwand:** 15 Min
  - **Commit:** `feat: implement template switch navigation logic`

### 6.6: TextArea-Erweiterung (3h)
**Branch:** `feature/textarea-file-upload`

**Ziel:** Image-Block Funktionalität in TextArea integrieren

**KONTEXT:**
- Standard-Template: Datepicker (Pflicht) + TextArea (Optional)
- TextArea als "Universal-Container" für Notizen + Events + Dateien
- Daten-Entkopplung: Text/Events/Files alle optional
- "Nur Foto"-Eintrag möglich (Text kann leer bleiben)

**Tasks:**

- [ ] **Foto & PDF Buttons hinzufügen**
  - 4 Buttons: 📅 Event | 🩺 Doc | 📷 Foto | 📄 PDF
  - Layout: Horizontal, nur Icons (keine Beschriftung)
  - Touch Target: 44x44px, gap: 12px
  - Tooltips für Klarheit
  - Icons: Calendar, Stethoscope, Camera, FileText (lucide-react)
  - **Aufwand:** 30 Min
  - **Commit:** `feat: add photo and pdf buttons to textarea block`

- [ ] **File-Upload Logik migrieren**
  - Code aus ImageBlock übernehmen:
    - File Input Handler
    - Base64 Encoding (fileToBase64)
    - File Types: `accept="image/*,application/pdf"`
  - onClick Handler für Foto/PDF Buttons
  - **Aufwand:** 45 Min
  - **Commit:** `feat: migrate file upload logic from image block to textarea`

- [ ] **File-Preview Component integrieren**
  - Thumbnail-Grid unter TextArea
  - Bild-Preview für Fotos (img src)
  - PDF-Icon für PDFs (FileText Icon)
  - Delete-Button pro Datei (× Icon)
  - Responsive Grid: 2-3 Spalten je nach Breite
  - **Aufwand:** 45 Min
  - **Commit:** `feat: add file preview grid to textarea block`

- [ ] **Block.value Schema erweitern**
  ```typescript
  interface TextAreaBlockValue {
    text?: string;              // Optional
    events?: EventData[];       // Bereits vorhanden
    attachedFiles?: AttachedFile[]; // NEU
  }
  
  interface AttachedFile {
    id: string;
    name: string;
    type: 'image' | 'pdf';
    data: string; // Base64
    createdAt: string;
  }
  ```
  - TypeScript Types aktualisieren in `types/blocks.ts`
  - **Aufwand:** 15 Min
  - **Commit:** `feat: extend textarea block value schema for attached files`

- [ ] **Daten-Entkopplung implementieren**
  - Text optional (kann leer sein)
  - Events optional
  - Dateien optional
  - Alle kombinierbar
  - Validierung: Entry ist valid auch wenn nur attachedFiles vorhanden
  - **Aufwand:** 15 Min
  - **Commit:** `feat: implement independent data handling in textarea`

- [ ] **Image-Block aus Palette entfernen (Legacy)**
  - BlockPalette.tsx: Image-Block Eintrag entfernen
  - Code BEHALTEN in BlockRenderer (Legacy-Support)
  - Kommentar hinzufügen: "// LEGACY: Image-Block für alte Templates"
  - **Aufwand:** 10 Min
  - **Commit:** `refactor: remove image block from palette (legacy support maintained)`

- [ ] **Auto-Migration alter Templates**
  - Migration-Funktion in `db.ts`:
    ```typescript
    function migrateImageBlocksToTextArea(template: Template): Template {
      const migratedBlocks = template.blocks.map(block => {
        if (block.type === 'image') {
          return {
            ...block,
            type: 'textarea',
            value: {
              attachedFiles: block.value // Image-Daten übernehmen
            }
          };
        }
        return block;
      });
      return { ...template, blocks: migratedBlocks };
    }
    ```
  - Bei `getTemplates()`: Auto-Migration durchführen
  - Transparent für User, kein Datenverlust
  - **Aufwand:** 20 Min
  - **Commit:** `feat: auto-migrate image blocks to textarea on template load`

**Button-Layout CSS:**
```css
.textarea-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  align-items: center;
}

.textarea-action-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--secondary);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s;
}

.textarea-action-btn:hover {
  background: var(--accent);
  transform: translateY(-2px);
}
```

### 6.7: Standard-Template Auto-Generierung (30 Min)
**Branch:** `feature/default-template-blocks`

**Ziel:** Neue Templates starten mit Standard-Blöcken

- [ ] **Standard-Blöcke bei Template-Erstellung**
  ```typescript
  // EditorMode.tsx: handleCreateTemplate()
  const defaultBlocks: Block[] = [
    {
      id: generateUUID(),
      type: 'date',
      label: 'Datum',
      hideLabelInDiary: false,
      value: undefined,
      isDeletable: false, // PFLICHT - kann nicht gelöscht werden
    },
    {
      id: generateUUID(),
      type: 'textarea',
      label: 'Notizen',
      hideLabelInDiary: false,
      value: undefined,
      isDeletable: true,  // OPTIONAL - kann gelöscht werden
    }
  ];
  
  await createTemplate(name, defaultBlocks);
  ```
  - **Aufwand:** 15 Min
  - **Commit:** `feat: add default date and textarea blocks to new templates`

- [ ] **isDeletable Property implementieren**
  - Property zu Block Interface hinzufügen
  - SortableBlock: Delete-Button disabled wenn `isDeletable === false`
  - UI-Feedback: Tooltip "Pflicht-Block kann nicht gelöscht werden"
  - Oder: Delete-Button komplett ausblenden bei Pflicht-Blöcken
  - **Aufwand:** 15 Min
  - **Commit:** `feat: implement isDeletable property for mandatory blocks`

### 6.8: Icon Picker Lucide-Integration (1.5h) 🆕
**Branch:** `feature/lucide-icon-picker`

**Ziel:** Zugriff auf alle 1,500+ Lucide Icons mit Suchfunktion

**KONTEXT:**
- Aktuell: Wenige vordefinierte Icons
- Lucide bereits installiert (lucide-react)
- Tree-shakeable: Nur genutzte Icons im Bundle
- Bundle-Size Impact: +10KB (nur Icon-Namen)

**Tasks:**

- [ ] **Icon-Namen extrahieren**
  ```typescript
  import * as LucideIcons from 'lucide-react';
  
  const iconNames = Object.keys(LucideIcons).filter(
    key => typeof LucideIcons[key] === 'function'
  );
  ```
  - Alle verfügbaren Icon-Namen sammeln
  - Filtern: Nur Komponenten, keine Utils
  - **Aufwand:** 15 Min
  - **Commit:** `feat: extract lucide icon names for picker`

- [ ] **Icon-Browser UI erstellen**
  - Modal/Popover mit Icon-Grid
  - Search-Input oben
  - Grid: 6-8 Icons pro Zeile (responsive)
  - Scroll-Container für alle Icons
  - Aktuell ausgewähltes Icon highlighten
  - **Aufwand:** 45 Min
  - **Commit:** `feat: create icon browser UI with grid layout`

- [ ] **Search-Filter implementieren**
  ```typescript
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredIcons = iconNames.filter(name =>
    name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  ```
  - Echtzeit-Suche (onChange)
  - Case-insensitive
  - Placeholder: "Icon suchen... (z.B. heart, star, user)"
  - **Aufwand:** 15 Min
  - **Commit:** `feat: implement icon search filter`

- [ ] **Icon-Rendering & Selection**
  ```tsx
  {filteredIcons.map(iconName => {
    const IconComponent = LucideIcons[iconName];
    return (
      <button 
        key={iconName}
        onClick={() => onIconSelect(iconName)}
        className={selectedIcon === iconName ? 'selected' : ''}
      >
        <IconComponent size={24} />
      </button>
    );
  })}
  ```
  - Dynamic Icon-Import
  - Click-Handler für Selection
  - Aktives Icon visuell markieren
  - **Aufwand:** 15 Min
  - **Commit:** `feat: implement icon rendering and selection`

- [ ] **Integration in TemplateStylePicker**
  - Aktuellen Icon-Picker ersetzen
  - Button "Icon wählen" öffnet Lucide-Browser
  - Selected Icon anzeigen
  - Icon-Name speichern (z.B. "Heart" statt Emoji)
  - **Aufwand:** 10 Min
  - **Commit:** `feat: integrate lucide icon picker into template style picker`

**WICHTIG:** Bundle-Size prüfen nach Implementierung (sollte ~10KB mehr sein)

---

## 🎯 PHASE 7: PFLICHTFELD-WORKFLOW (MEDIUM PRIO)

**Nach Phase 6 & Code Cleanup**  
**Branch:** `feature/required-field-workflow`

### 7.1: Visuelle Pflichtfeld-Markierung (30 Min)
- [ ] Roter Rahmen bei leerem Label
- [ ] Pulsierender Glow-Effekt (CSS Animation)
- [ ] Hint: "Überschrift erforderlich"
- [ ] Nur bei neu erstellten Blocks (isNew Flag)
- **Commit:** `feat: add required field indicator for empty block labels`

### 7.2: Auto-Focus (15 Min)
- [ ] useRef für Label-Input
- [ ] useEffect: Focus wenn `block.isNew === true`
- [ ] Keyboard öffnet auf Mobile (inputmode, autofocus)
- [ ] 100ms Delay für Animation
- **Commit:** `feat: auto-focus on label input for new blocks`

### 7.3: Validierung (30 Min)
- [ ] Helper: `isBlockValid(block)` prüft Label nicht leer
- [ ] Save-Button disabled wenn `hasInvalidBlocks`
- [ ] Drag & Drop disabled für invalide Blocks
- [ ] Visuelles Feedback: Disabled-Overlay
- **Commit:** `feat: validate block labels before save and drag`

### 7.4: Testing (15 Min)
- [ ] Alle Block-Typen testen
- [ ] Mobile: Auto-Focus + Keyboard
- [ ] Edge-Case: Label mit nur Leerzeichen
- **Commit:** `test: verify required field workflow`

---

## 📚 PHASE 8: CODE CLEANUP (HIGH PRIO)

**VOR weiteren UX-Features durchführen**  
**Branch:** `chore/code-cleanup`

### 8.1: Ungenutzte Dateien (30 Min)
- [ ] `src/styles/utilities.css` löschen
- [ ] `src/components/TemplateEditor.tsx` löschen
- [ ] Doppelte `filterEntriesByTimeRange` in `dashboardData.ts` entfernen
- [ ] Console.logs entfernen (außer Error-Logs)
- [ ] Ungenutzte Imports bereinigen
- **Commit:** `chore: remove unused files and clean up code`

### 8.2: CSS Konsolidierung (1h)
- [ ] `layout.css` prüfen: Ungenutzte Klassen entfernen
- [ ] `blocks.css` prüfen: Ungenutzte Klassen entfernen
- [ ] `Header.tsx` Komponente prüfen (evtl. obsolet?)
- [ ] CSS-Variablen zentralisieren:
  ```css
  /* Spacing Scale */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Touch Targets */
  --touch-target-min: 44px;
  --button-padding: 12px;
  
  /* Z-Index Layers */
  --z-header: 10;
  --z-floating: 20;
  --z-modal-overlay: 50;
  --z-modal-content: 51;
  ```
- **Commit:** `chore: consolidate CSS and add design tokens`

### 8.3: TypeScript (45 Min)
- [ ] Stricter types für `Block.value` (Union Types pro Block-Type)
- [ ] ESLint Warnings beheben
- [ ] Unused variables entfernen
- [ ] `any` types ersetzen
- **Commit:** `refactor: improve typescript types and fix lint warnings`

---

## 🎨 PHASE 9: ONBOARDING (LOW PRIO)

**NACH Code Cleanup**  
**Branch:** `feature/onboarding-system`

### 9.1: Template-Vorlagen (3h)
- [ ] **Brainstorming: Welche Vorlagen?**
  - "Kopfschmerz-Tagebuch" (Schmerzstärke, Medikamente, Trigger)
  - "Migräne-Tracking" (Aura, Übelkeit, Dauer, Auslöser)
  - "Chronischer Schmerz" (Schmerzskala, Aktivität, Schlaf, Stimmung)
  - Template-JSONs vorbereiten

- [ ] **Vorlagen-Galerie UI**
  - Preview-Cards mit Template-Icon
  - Kurzbeschreibung pro Vorlage
  - "Von Vorlage starten" vs "Leer starten"
  - Modal oder Onboarding-Screen

- [ ] **Template-Import aus Vorlagen**
  - Import-Funktion erweitern
  - Vordefinierte JSONs laden
  - Testing mit allen Vorlagen

### 9.2: Quick-Start Tutorial (4h)
- [ ] **Tutorial-Konzept**
  - Guided Tour durch Editor
  - Interaktive Tooltips mit Highlights
  - Step-by-Step: Template erstellen → Block hinzufügen → Speichern

- [ ] **Tutorial-Implementierung**
  - Overlay-System für Tooltips
  - Highlight-Animation für Bereiche
  - "Weiter" / "Überspringen" Buttons
  - LocalStorage: Tutorial-Status speichern

### 9.3: Empty States (1h)
- [ ] **Editor Empty State**
  - Anleitung statt "Noch keine Blöcke"
  - Visuell ansprechende Illustration
  - Call-to-Action: "Ersten Block hinzufügen"
  - Hint: Reihenfolge = Ausfüll-Flow

---

## 🔮 PHASE 10: FUTURE FEATURES (VERY LOW PRIO)

**Für spätere Versionen**

### 10.1: Drag Visual Effects (1h)
**Status:** Kosmetisch, nicht in v1.0 relevant

- [ ] Dragging State: opacity 0.5, scale 1.05
- [ ] Drop-Zone Highlight: border dashed, background tint
- [ ] Smooth Transitions
- **Commit:** `style: add visual feedback for drag and drop`

### 10.2: Keyboard Shortcuts (1h)
**Status:** Optional für Power-User

- [ ] Ctrl+S = Save
- [ ] Ctrl+Z = Undo (wenn Undo-System implementiert)
- [ ] Escape = Modal schließen
- [ ] Delete = Block löschen (wenn fokussiert)
- **Commit:** `feat: add keyboard shortcuts for common actions`

### 10.3: Undo/Redo System (2h)
**Status:** Vorerst nicht gewünscht

- [ ] History Stack implementieren
- [ ] Undo/Redo Buttons im Header
- [ ] Keyboard Shortcuts Integration
- **Commit:** `feat: implement undo/redo system`

### 10.4: MultiSelect Presets (Version 2.0+)
**Status:** User schlägt konkrete Presets vor wenn gewünscht

- [ ] Vordefinierte Button-Sets
- [ ] Preset-Selector in Modal
- [ ] Eigene Presets speichern

### 10.5: Weitere Features
- [ ] BodyMapBlock vollständig implementieren
- [ ] Chart Export (Image/PDF)
- [ ] Multi-Language Support (i18n)
- [ ] Cloud Sync (E2E-verschlüsselt)

---

## 🐛 KNOWN ISSUES

- [ ] **WICHTIG:** IndexedDB Datenverlust bei Cookie-Cleanup (iOS) - später lösen
- [ ] Encryption: Event/Pain extraction in dashboardData.ts (decryptFn TODO)
- [ ] TypeScript: Stricter types für Block.value (→ Phase 8.3)
- [ ] Performance: Große Entry-Mengen (>1000) können Charts verlangsamen
- [ ] Homepage: Template-Icons nicht automatisch mittig angeordnet (bei z.B. 2 Templates)

---

## 📋 DESIGN-ENTSCHEIDUNGEN DOKUMENTIERT

### UX-Analyse (12.02.2026)
- **Durchgeführt:** Code-Review + Best-Practice Recherche
- **Quellen:** Material Design, Apple HIG, Mobbin, LogRocket
- **Ergebnis:** 12 Probleme identifiziert, 15 Verbesserungen erarbeitet
- **Bewertung:** 6/10 (funktional, ausbaufähig)

### User-Entscheidungen (12.02.2026)
- ✅ **Drag Handle:** Behalten (sichtbar, nicht verstecken)
- ✅ **Visuelle Trennung:** Sections (NICHT künstliche Hierarchie)
- ✅ **Block-Aktionen:** Toggle "Einfach/Erweitert" (Variante A)
  - Einfach: Nur Dashboard + Eye Toggle
  - Erweitert: Alle Buttons am rechten Rand
  - Context-Menu für Edit/Delete (immer verfügbar)
  - Fallback (Variante B): Nur Context-Menu (notiert, nicht implementiert)
- ✅ **Touch Targets:** 44x44px (Apple HIG)
- ✅ **Collapsible Palette:** Floating "+" Button
- ✅ **Modal-System:** Vereinheitlichen mit BaseModal
- ✅ **TextArea:** Mit Foto/PDF Buttons (ersetzt Image-Block)
- ✅ **Image-Block:** Legacy (Code behalten, aus Palette entfernt)
- ✅ **Auto-Migration:** Alte Image-Blocks → TextArea
- ✅ **Standard-Template:** Datepicker (Pflicht) + TextArea (Optional)
- ✅ **Template-Switcher:** Buttons ◀ ▶ (keine Swipe-Geste)
- ✅ **Icon Picker:** Lucide-Integration (1,500+ Icons + Suchleiste)
- ✅ **Bulk-Actions:** In Header implementieren
- ❌ **Block Duplication:** Nicht umsetzen
- ❌ **Template Preview:** Nicht umsetzen
- ❌ **Block-Numerierung:** Nicht umsetzen
- ❌ **Keyboard Shortcuts:** Phase 10 (Optional)
- ❌ **Undo/Redo:** Phase 10 (Vorerst nicht gewünscht)
- 📅 **Onboarding:** Nach Cleanup (Phase 9)
- 📅 **Drag Visual Effects:** Phase 10 (Low Prio)
- 📅 **MultiSelect Presets:** Version 2.0+ (User schlägt vor)

### Offene Design-Details
- **Context-Menu Style:** shadcn/ui Standard oder Custom?
- **Toggle Button Label:** "Einfach/Erweitert" oder Icons?
- **Icon-Browser:** Modal oder Popover?

---

## 📊 AUFWANDS-SCHÄTZUNG PHASE 6

| Sub-Phase | Aufwand | Priorität |
|-----------|---------|-----------|
| 6.1 Quick Wins | 1h | KRITISCH |
| 6.2 Visuelle Trennung + Bulk-Actions | 2.5h | HOCH |
| 6.3 Block-Aktionen | 1.5h | HOCH |
| 6.4 Modal-System | 2h | MITTEL |
| 6.5 Template-Switcher | 45 Min | MITTEL |
| 6.6 TextArea-Erweiterung | 3h | HOCH |
| 6.7 Standard-Template | 30 Min | NIEDRIG |
| 6.8 Icon Picker Lucide | 1.5h | MITTEL |
| **GESAMT** | **~13h** | - |

---

## 🎯 NÄCHSTE SCHRITTE

**Phase 6 Ready to Start:**
1. ✅ Alle Design-Entscheidungen getroffen
2. ✅ Technische Machbarkeit geprüft
3. ✅ Aufwand geschätzt
4. ✅ Priorisierung klar

**Empfohlene Reihenfolge:**
1. Phase 6.1 (Quick Wins - 1h)
2. Phase 6.2 (Struktur + Bulk-Actions - 2.5h)
3. Phase 6.6 (TextArea-Erweiterung - 3h)
4. Phase 6.7 (Standard-Template - 30 Min)
5. Phase 6.3 (Block-Aktionen - 1.5h)
6. Phase 6.8 (Icon Picker - 1.5h)
7. Phase 6.5 (Template-Switcher - 45 Min)
8. Phase 6.4 (Modal-System - 2h)

**Dann:** Phase 8 (Code Cleanup) vor weiteren Features

---

**Letzte Aktualisierung:** 12.02.2026  
**Aktueller Stand:** Phase 5 komplett ✅, Phase 6 finalisiert und ready  
**Nächster Schritt:** Phase 6.1 - Quick Wins implementieren  
**Status:** ✅ ROADMAP FINALISIERT - READY FOR IMPLEMENTATION
