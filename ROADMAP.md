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

### 6.3: Block-Aktionen Vereinfachung (3h) ✅ KOMPLETT
**Branch:** `feature/block-actions-simplified`
**Status:** Abgeschlossen (13.02.2026)

**Ziel:** Weniger permanente Buttons, schlanke PWA

- [x] **Toggle "Erweiterte Ansicht" im Header** ✅
  - 3. Checkbox in TemplateStylePicker: "Erweiterte Ansicht"
  - State: `showAdvancedActions` (boolean, default: false)
  - **Standard (Checkbox aus):** ALLE Buttons ausgeblendet
  - **Erweitert (Checkbox an):** Dashboard + Eye Toggle sichtbar
  - Conditional Rendering in SortableBlock implementiert
  - **Commit:** `feat: add advanced view toggle for block actions`

- [x] **Dropdown-Menu für Edit/Delete** ✅
  - ChevronDown Button rechts oben (immer sichtbar)
  - Dropdown-Menu mit "Bearbeiten" + "Löschen"
  - Edit/Delete Buttons komplett entfernt
  - Konsistent mit Header-Pattern
  - **Commit:** `feat: replace edit/delete buttons with dropdown menu`

### 6.3b: Inline-Edit & Collapsible Settings (2h) ✅ KOMPLETT
**Branch:** `feature/inline-edit-blocks`
**Status:** Abgeschlossen (13.02.2026)

**Ziel:** Block-Labels inline editierbar, Settings in Collapsible Containern

- [x] **Inline-Edit Labels (alle Block-Typen)** ✅
  - Label → Input Component (wie Template-Name)
  - Variable Breite basierend auf Text-Länge
  - onChange Handler → editingBlocks updaten
  - **Commit:** `feat: make block labels inline editable with collapsible settings`

- [x] **Slider: Collapsible Edit-Container** ✅
  - Dropdown-Item "Bearbeiten" öffnet Container unter Label
  - Container: Min/Max/Step Inputs + Dashboard Toggle
  - "Dashboard konfigurieren" Button entfernt
  - **Commit:** `feat: make block labels inline editable with collapsible settings`

- [x] **BodyMap: Collapsible Edit-Container** ✅
  - Dropdown-Item "Bearbeiten" öffnet Container unter Label
  - Container: Type-Selector (Schmerzwert/Funktionswert) + Dashboard Toggle
  - "Dashboard konfigurieren" Button entfernt
  - **Commit:** `feat: make block labels inline editable with collapsible settings`

- [x] **Date + TextArea: Dropdown conditional** ✅
  - Dropdown-Item "Bearbeiten" NICHT angezeigt (gibt es nichts zu bearbeiten)
  - Nur "Löschen" im Dropdown
  - **Commit:** `feat: make block labels inline editable with collapsible settings`

### 6.3d: MultiSelect Collapsible Settings (3h) ✅ KOMPLETT
**Branch:** `feature/multiselect-collapsible`
**Status:** Abgeschlossen (14.02.2026)

**Ziel:** MultiSelect-Modal in Collapsible Container umwandeln

- [x] **MultiSelect Settings Container**
  - Container mit Button-Liste + DnD-Modus
  - ArrowDownUp Icon als Toggle
  - Expandierbar mit "Ziehe Buttons zum Sortieren"
  - Gelber Container + Pulse-Animation
  - Palette-Icon für Farbauswahl (20% opacity)
  - Add-Input versteckt im DnD-Modus
  - Click außerhalb deaktiviert DnD
  - **Commit:** `feat: convert multiselect modal to collapsible container`

- [x] **UI Corrections & Refinements**
  - Button-Sizing auf Input-Höhe (40px)
  - Palette-Icon statt runder Button
  - BlockRenderer für Preview entfernt
  - **Commit:** `fix: multiselect editor corrections per user feedback`

- [x] **Button Preview in Collapsed State**
  - MultiSelect-Buttons anzeigen wenn Container collapsed
  - Preview mit BlockRenderer (readOnly=true)
  - Button-Row Höhe: 57.6px → 36px
  - Margins entfernt für tightere Spacing
  - DB Version 12
  - **Commit:** `feat: add multiselect button preview in collapsed editor state`

### 6.3c: Lösch-Bestätigung & Image-Block Cleanup (30 Min) ✅ KOMPLETT
**Branch:** `feature/delete-confirmation`
**Status:** Abgeschlossen (14.02.2026)

- [x] **Lösch-Bestätigung**
  - Confirmation-Dialog bei "Löschen" Click
  - Verhindert versehentliches Löschen
  - Dialog zeigt Block-Label zur Bestätigung
  - **Commit:** `feat: add confirmation dialog for block deletion`

- [x] **Image-Block aus Palette entfernen**
  - Image-Block aus BlockPalette entfernt (Phase 6.7)
  - Image-Block aus Standard-Template entfernt (15.02.2026)
  - DB Version 13
  - Legacy-Support in BlockRenderer vorhanden
  - **Commit:** `chore: remove image block from standard template`

### 6.4: Global DnD Modus (2h) ✅ KOMPLETT
**Branch:** `feature/global-dnd-mode`
**Status:** Abgeschlossen (15.02.2026)

**Ziel:** DnD-Toggle-System aus MultiSelect auf gesamten Editor anwenden

- [x] **"Template bearbeiten" Header-Text entfernt**
  - Header bereinigt, nur Zurück-Button
  - **Commit:** `feat: add global dnd mode with full block dragging`

- [x] **DnD-Toggle als Floating Button**
  - Position: Links neben Template-Hinzufügen (+)
  - ArrowDownUp Icon (gelb im aktiven Zustand)
  - Kein Text, nur Icon mit Tooltip
  - State: `isDndMode` (boolean, default: false)
  - **Commit:** `feat: add global dnd mode with full block dragging`

- [x] **Drag-Handles komplett entfernt**
  - Keine Drag-Handles mehr sichtbar (weder aktiv noch inaktiv)
  - Gesamter Block wird drag-bar im DnD-Modus
  - **Commit:** `feat: add global dnd mode with full block dragging`

- [x] **Global DnD State Management**
  - State in EditorMode: `isDndMode`
  - Prop an SortableBlock weitergegeben
  - Drag-Attribute auf Card statt Handle
  - Gesamter Block ist drag-bar wenn `isDndMode === true`
  - **Commit:** `feat: add global dnd mode with full block dragging`

- [x] **UI-Feedback im DnD-Modus**
  - Blocks: Gelber dashed Border (#eab308)
  - Hintergrund: rgba(234, 179, 8, 0.05)
  - Cursor: grab → grabbing für gesamten Block
  - Alle Inputs/Controls gesperrt (pointer-events: none)
  - Labels readonly/disabled
  - Dropdown-Menu disabled
  - **Commit:** `feat: add global dnd mode with full block dragging`

- [x] **Click-außerhalb deaktiviert DnD**
  - Event-Listener auf document
  - Prüft Click außerhalb `.sortable-block` und `.floating-btn-glass`
  - Automatisches Deaktivieren des DnD-Modus
  - **Commit:** `feat: add global dnd mode with full block dragging`

- [x] **DnD Toggle Button Styling**
  - Gelber Hintergrund + Border im aktiven Zustand
  - Pulse-Glow Animation (gelb)
  - Icon stroke-width: 2.5
  - **Commit:** `feat: add global dnd mode with full block dragging`

### 6.4b: Save-Button dauerhaft sichtbar (15 Min) ✅ KOMPLETT
**Branch:** `feature/editor-save-button`
**Status:** Abgeschlossen (15.02.2026)

**Ziel:** Save-Button immer im Header sichtbar (nicht nur bei Änderungen)

- [x] **Save-Button dauerhaft sichtbar**
  - Immer in Floating Buttons sichtbar
  - Normal: Weißer Hintergrund, schwarzes Icon (opacity 50%)
  - Mit Änderungen: Grüner Hintergrund, grünes Icon, pulse-glow
  - Disabled wenn keine Änderungen (`!hasUnsavedChanges`)
  - **Commit:** `feat: make save button permanently visible in editor`

### 6.5: Collapsible-Dropdown-Redesign (1.5h) ✅ KOMPLETT
**Branch:** `feature/editor-unified-containers`
**Status:** Abgeschlossen (15.02.2026)

**Ziel:** Einheitliche Edit-Container für ALLE Block-Typen

- [x] **ChevronDown/Up Toggle für alle Blocks**
  - Slider, BodyMap, MultiSelect, Date, TextArea
  - KEIN Dropdown-Menu mehr
  - Sofortiges Öffnen/Schließen des Containers
  - Icon wechselt: ChevronDown ↔ ChevronUp
  - **Commit:** `feat: unify all blocks with collapsible edit containers`

- [x] **Delete-Button in allen Edit-Containern**
  - Roter Button am Ende jedes Containers
  - Layout: Volle Breite, outlined, destructive
  - Text: "Block löschen" + Trash Icon
  - Touch-Target: min-height 44px
  - **Commit:** `feat: unify all blocks with collapsible edit containers`

- [x] **Date & TextArea Edit-Container**
  - Neue Container mit Info-Text
  - "Datumsblock hat keine zusätzlichen Einstellungen."
  - "Textfeld hat keine zusätzlichen Einstellungen."
  - Delete-Button auch hier unten
  - **Commit:** `feat: unify all blocks with collapsible edit containers`

- [x] **Container-Styling vereinheitlicht**
  - Alle Container: `mt-4 p-3 bg-secondary/20 rounded-lg space-y-3`
  - Separator vor Delete-Button
  - Consistent spacing (12px padding)
  - **Commit:** `feat: unify all blocks with collapsible edit containers`

- [x] **Dropdown-Menu komplett entfernt**
  - DropdownMenu Imports entfernt
  - Edit Icon entfernt (ChevronDown/Up zeigt State)
  - Code bereinigt
  - **Commit:** `feat: unify all blocks with collapsible edit containers`

- [x] **Bug Fix: handleEditBlockOptions**
  - Funktion funktioniert jetzt für ALLE Block-Typen
  - Vorher: Nur Slider/BodyMap/MultiSelect
  - Nachher: Alle 5 Block-Typen inkl. Date/TextArea
  - **Commit:** `feat: unify all blocks with collapsible edit containers`

- [x] **MultiSelectEditor Padding entfernt**
  - Padding wird vom äußeren Container gehandhabt
  - Konsistente Spacing-Hierarchie
  - **Commit:** `feat: unify all blocks with collapsible edit containers`

### 6.4: Modal-System Vereinheitlichung (2h)
**Branch:** `refactor/modal-components`
**Status:** Verschoben (nach Global DnD & Dropdown-Redesign)

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

### 6.6: Template-Switcher & Header UX (1.5h)
**Branch:** `feature/template-switcher`
**Status:** Verschoben (nach Dropdown-Redesign)

**BESCHLOSSEN:** Buttons (keine Swipe-Geste)

**Platz-Prüfung (durchgeführt):**
- iPhone SE (375px): ✅ 335px verfügbar ≥ 282px benötigt
- Android (360px): ✅ 320px verfügbar ≥ 282px benötigt
- Template-Name zu lang: Text-Overflow ellipsis

- [ ] **Navigation Buttons im Header**
  - Layout: `◀ [Template-Name] ▶`
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

- [ ] **Header Layout Cleanup**
  - "Template bearbeiten" Text entfernen (kollidiert mit Floating Buttons)
  - Nur Navigation Buttons + Template-Name im Header
  - Floating Buttons bleiben unberührt
  - **Aufwand:** 15 Min
  - **Commit:** `style: remove template bearbeiten text from header`

### 6.7: TextArea-Erweiterung (3h) ✅ KOMPLETT
**Branch:** `feature/textarea-file-upload`
**Status:** Abgeschlossen (14.02.2026)
**Commits:** 2 Commits vorbereitet

### 6.7b: Icon-Größen iOS-konform (30 Min) ✅ KOMPLETT
**Branch:** `feature/textarea-file-upload`
**Status:** Abgeschlossen (14.02.2026)

**Ziel:** Icon-Größen auf iOS-Standards anpassen (44px Buttons, 22px Icons)

**Kontext:**
- Apple HIG empfiehlt: 44pt Touch-Targets, 22-24pt Icons
- Vorher: 44px Buttons mit 16-18px Icons = ~30% Padding (zu viel)
- Nachher: 44px Buttons mit 20-22px Icons = ~25% Padding (iOS-konform)

**Tasks:**

- [x] **TextAreaBlock.tsx**
  - Event, Doctor, Photo, PDF Buttons: 18px → 22px
  - **Commit:** `style: increase icon sizes to 22px for iOS conformity`

- [x] **SortableBlock.tsx**
  - GripVertical: 18px → 22px
  - Eye/EyeOff: 16px → 20px
  - ChevronDown, Edit, Trash2: 16px → 20px

- [x] **DashboardToggleButtons.tsx**
  - BarChart3: 16px → 20px
  - Settings: 14px → 18px

- [x] **DiaryView.tsx**
  - Alle Menu Icons: 18/20px → 22px
  - Template Icons: 20px → 22px
  - Floating Buttons: 20px → 22px

**Ergebnis:**
- Primäre Icons: 22px
- Sekundäre Icons: 20px
- Kleine Icons: 18px
- Padding-Verhältnis: ~25% (iOS-Standard)

---

**Ziel (Phase 6.7):** Image-Block Funktionalität in TextArea integrieren

**KONTEXT:**
- Standard-Template: Datepicker (Pflicht) + TextArea (Optional)
- TextArea als "Universal-Container" für Notizen + Events + Dateien
- Daten-Entkopplung: Text/Events/Files alle optional
- "Nur Foto"-Eintrag möglich (Text kann leer bleiben)

**Tasks:**

- [x] **Foto & PDF Buttons hinzufügen**
  - 4 Buttons: 📅 Event | 🩺 Doc | 📷 Foto | 📄 PDF
  - Layout: Horizontal, nur Icons (keine Beschriftung)
  - Touch Target: 44x44px, gap: 12px
  - Tooltips für Klarheit
  - Icons: Calendar, Stethoscope, Camera, FileText (lucide-react)
  - **Commit:** `feat: add photo and pdf buttons to textarea block`

- [x] **File-Upload Logik implementiert**
  - File Input Handler mit useRef
  - Base64 Encoding (fileToBase64)
  - File Types: `accept="image/*,application/pdf"`
  - onClick Handler für Foto/PDF Buttons
  - Validierung für File-Types
  - **Commit:** `feat: implement file upload logic in textarea`

- [x] **File-Preview Component integriert**
  - Thumbnail-Grid unter TextArea (2 Spalten)
  - Bild-Preview für Fotos (img src)
  - PDF-Icon für PDFs (FileText Icon)
  - Delete-Button pro Datei (X Icon, destructive)
  - Responsive Grid: grid-cols-2 gap-2
  - **Commit:** `feat: add file preview grid to textarea block`

- [x] **Block.value Schema erweitert**
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
  - TypeScript Types aktualisiert in `types/blocks.ts`
  - BlockValue Type erweitert
  - Type Guard angepasst
  - **Commit:** `feat: extend textarea block value schema for attached files`

- [x] **Daten-Entkopplung implementiert**
  - Text optional (kann leer sein)
  - Events optional
  - Dateien optional
  - Alle kombinierbar
  - Backward-Kompatibilität mit string-values
  - **Commit:** `feat: implement independent data handling in textarea`

- [x] **Image-Block aus Palette entfernt**
  - BlockPalette.tsx: Image-Block auskommentiert
  - Code BEHALTEN in BlockRenderer (Legacy-Support)
  - Kommentar: "// LEGACY: Image-Block aus Palette entfernt - Funktionalität in TextArea integriert"
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

### 6.8: Standard-Template Auto-Generierung (30 Min)
**Branch:** `feature/default-template-blocks`
**Status:** Geplant

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

### 6.9: Icon Picker Lucide-Integration (1.5h) 🆕
**Branch:** `feature/lucide-icon-picker`
**Status:** Geplant

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

### 8.4: Package Size Optimierung (1h) 🆕
**Status:** Geplant (nach shadcn/ui Popover-Umstellung)

**Ziel:** Radix-UI Abhängigkeiten reduzieren, auf shadcn/ui konsolidieren

- [ ] **Analyse aktuelle Dependencies**
  - Alle @radix-ui/* packages auflisten
  - Prüfen welche über shadcn/ui Komponenten laufen
  - Bundle-Size Impact messen (bundlephobia.com)
  - **Aufwand:** 15 Min
  - **Commit:** `docs: analyze radix-ui dependencies and bundle impact`

- [ ] **shadcn/ui Popover Component**
  - Prüfen ob @radix-ui/react-popover direkt genutzt wird
  - Oder ob alle Popovers über src/components/ui/popover.tsx laufen
  - Falls direkt: Migration zu shadcn/ui Pattern
  - **Aufwand:** 15 Min
  - **Commit:** `refactor: migrate to shadcn/ui popover pattern`

- [ ] **Ungenutzte @radix-ui packages entfernen**
  - `npm uninstall @radix-ui/react-popover` (falls über shadcn/ui)
  - Prüfen ob andere @radix-ui/* packages ungenutzt
  - package.json bereinigen
  - **Aufwand:** 15 Min
  - **Commit:** `chore: remove unused radix-ui packages`

- [ ] **Bundle-Size Verifikation**
  - Build durchführen: `npm run build`
  - Bundle-Size prüfen: dist/assets/*.js Größe
  - Vergleich vorher/nachher dokumentieren
  - **Aufwand:** 15 Min
  - **Commit:** `chore: verify bundle size reduction`

**WICHTIG:** shadcn/ui nutzt @radix-ui als Peer-Dependencies - nur wirklich ungenutzte entfernen!

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

### 10.6: Lösch-Bestätigungen vereinheitlichen (LOW PRIO)
**Status:** Konsistenz-Task für spätere Version

- [ ] **Audit aller Lösch-Funktionen**
  - SortableBlock (Block löschen) ✅ bereits implementiert
  - EditorMode (Template löschen)
  - DiaryView (Entry löschen)
  - HomePage (Template löschen)
  - Weitere Lösch-Stellen identifizieren
  - **Aufwand:** 30 Min

- [ ] **Confirmation-Dialog vereinheitlichen**
  - Gemeinsame ConfirmDialog Komponente erstellen
  - Props: title, message, confirmText, cancelText, onConfirm, variant
  - Wiederverwendbar für alle Lösch-Aktionen
  - Konsistente Texte & Button-Styles
  - **Aufwand:** 1h

- [ ] **Migration bestehender Lösch-Funktionen**
  - Alle window.confirm() durch ConfirmDialog ersetzen
  - Konsistente UX über gesamte App
  - Testing auf Mobile
  - **Aufwand:** 1.5h

---

## 🐛 KNOWN ISSUES

### Editor UX
- [ ] **Drag & Drop: Vertikales Scrollen auf iPhone schwierig**
  - Problem: Scrollen funktioniert nur am rechten Rand gut
  - Mögliche Lösung: Alternative Drag-Logik? Scroll-Bereich vergrößern?
  - **Priorität:** HOCH (Mobile UX)

### Dashboard
- [ ] **Template-Icons werden nicht konsistent gerendert**
  - Problem: Bei Toggle der Template-Buttons manchmal Icons, manchmal Buchstaben
  - Inkonsistenz beim Wechseln zwischen Time-Filtern
  - **Priorität:** MITTEL

- [ ] **Touch-Support auf Charts verbesserungswürdig**
  - Problem: Touch+Hold markiert Bereich statt Punkt
  - Genaues Markieren eines Datenpunkts sehr schwierig
  - Lösung: Magnetisches Snapping? Horizontal-Drag für X-Achse?
  - **Priorität:** MITTEL

### System
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

### User-Entscheidungen (12.02.2026 + 14.02.2026)
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
- ✅ **MultiSelect:** Collapsible Container mit DnD-Toggle (14.02.2026)
- ✅ **Global DnD:** System aus MultiSelect auf ganzen Editor anwenden (14.02.2026)
- ✅ **Dropdown-Redesign:** ChevronDown = Instant Edit-Toggle, Delete-Button in Container (14.02.2026)
- ✅ **Package Size:** shadcn/ui bevorzugen, Radix-UI reduzieren (14.02.2026)
- ❌ **Block Duplication:** Nicht umsetzen
- ❌ **Template Preview:** Nicht umsetzen
- ❌ **Block-Numerierung:** Nicht umsetzen
- ❌ **Keyboard Shortcuts:** Phase 10 (Optional)
- ❌ **Undo/Redo:** Phase 10 (Vorerst nicht gewünscht)
- 📅 **Onboarding:** Nach Cleanup (Phase 9)
- 📅 **Drag Visual Effects:** Phase 10 (Low Prio)
- 📅 **MultiSelect Presets:** Version 2.0+ (User schlägt vor)

### Offene Design-Details
- **Icon-Browser:** Modal oder Popover?

---

## 📊 AUFWANDS-SCHÄTZUNG PHASE 6

| Sub-Phase | Aufwand | Priorität |
|-----------|---------|-----------|
| 6.1 Quick Wins | 1h | KRITISCH ✅ |
| 6.2 Visuelle Trennung + Bulk-Actions | 2.5h | HOCH ✅ |
| 6.3 Block-Aktionen | 1.5h | HOCH ✅ |
| 6.3b Inline-Edit & Collapsible | 2h | HOCH ✅ |
| 6.3d MultiSelect Collapsible | 3h | HOCH ✅ |
| 6.3c Lösch-Bestätigung | 30 Min | MITTEL |
| 6.4 Global DnD Modus | 2h | HOCH 🆕 |
| 6.5 Dropdown-Redesign | 1.5h | HOCH 🆕 |
| 6.6 Modal-System | 2h | MITTEL |
| 6.7 Template-Switcher | 1.5h | MITTEL |
| 6.8 TextArea-Erweiterung | 3h | HOCH |
| 6.9 Standard-Template | 30 Min | NIEDRIG |
| 6.10 Icon Picker Lucide | 1.5h | MITTEL |
| **GESAMT** | **~22h** | - |

---

## 🎯 NÄCHSTE SCHRITTE

**Aktuelle Priorisierung (15.02.2026):**
1. ✅ Phase 6.3d: MultiSelect Collapsible (KOMPLETT)
2. ✅ Phase 6.3c: Lösch-Bestätigung (KOMPLETT)
3. ✅ Phase 6.7: TextArea-Erweiterung (KOMPLETT)
4. ✅ Phase 6.7b: Icon-Größen iOS-konform (KOMPLETT)
5. ✅ Phase 6.4: Global DnD Modus (KOMPLETT)
6. ✅ Phase 6.5: Dropdown-Redesign/Unified Containers (KOMPLETT)
7. ✅ DB Version 13: Image-Block aus Standard-Template entfernt
8. 🚀 Phase 6.8: Standard-Template Auto-Generierung (NEXT)
9. Phase 6.9: Icon Picker Lucide
10. Phase 6.6: Template-Switcher
11. Phase 6.4: Modal-System
12. Phase 8: Code Cleanup

**Dann:** Phase 8 (Code Cleanup) vor weiteren Features

---

**Letzte Aktualisierung:** 15.02.2026  
**Aktueller Stand:** Phase 6.5 komplett ✅ (Unified Edit Containers)  
**Nächster Schritt:** Phase 6.8 - Standard-Template Auto-Generierung  
**DB Version:** 13 (Image-Block aus Standard-Template entfernt)  
**Status:** ✅ ALLE COMMITS DURCHGEFÜHRT - ROADMAP AKTUALISIERT
