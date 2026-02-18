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

### 6.4: Modal-System Vereinheitlichung (2h) ✅ KOMPLETT
**Branch:** `refactor/modal-system-unified`
**Status:** Abgeschlossen (17.02.2026)

- [x] **Alle window.prompt/confirm/alert ersetzt**
  - Template erstellen: `window.prompt` → shadcn Dialog mit Input + Inline-Fehler
  - Template löschen: `window.confirm` → shadcn Dialog (destructive)
  - Ungespeicherte Änderungen: `window.confirm` → shadcn Dialog (destructive)
  - **Commit:** `refactor: unify modal system and streamline block creation workflow`

- [x] **5 Modal-States → 1 DialogState Union Type**
  - `showBlockPalette`, `showAddBlockPopup`, `pendingBlockType`, `pendingEditBlockId`, `newBlockLabel` entfernt
  - Ersetzt durch: `dialog: { type: 'none' | 'block-palette' | 'create-template' | 'delete-template' | 'unsaved-changes' }`
  - **Commit:** `refactor: unify modal system and streamline block creation workflow`

- [x] **Add Block Popup Modal-Layer entfernt**
  - Blöcke werden direkt nach Palette-Auswahl angelegt (kein zweites Modal)
  - Collapsible Container öffnet automatisch
  - Einheitlicher Flow für alle Block-Typen (MultiSelect-Sonderfall entfernt)
  - **Commit:** `refactor: unify modal system and streamline block creation workflow`

- [x] **Orange Pulse-Glow Highlight für neue Blöcke**
  - `.block-new-highlight` auf Card, `.block-label-new` auf Label-Input
  - Auto-Dismiss nach erstem Label-Edit
  - Scroll-into-view (50ms Delay nach Render)
  - **Commit:** `refactor: unify modal system and streamline block creation workflow`

- [x] **Block Palette Dialog: aria-describedby={undefined}**
  - Radix UI Warning behoben (kein Description-Element nötig)
  - **Commit:** `fix: suppress aria-describedby warning on block palette dialog`

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

- [x] **Auto-Migration alter Templates**
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

### 6.8: Standard-Template Auto-Generierung + Vorlagen-Katalog (1.5h)
**Branch:** `feature/default-template-blocks`
**Status:** ✅ KOMPLETT (17.02.2026)

**Ziel:** Neue Templates starten mit Standard-Blöcken; Vorlagen-Katalog im Create-Dialog

- [x] **Standard-Blöcke bei Template-Erstellung**
  ```typescript
  // EditorMode.tsx: handleConfirmCreateTemplate()
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

- [x] **isDeletable Property implementieren**
  - Property zu Block Interface hinzufügen
  - SortableBlock: Delete-Button ausgeblendet wenn `isDeletable === false`
  - **Aufwand:** 15 Min
  - **Commit:** `feat: implement isDeletable property for mandatory blocks`

- [x] **Vorlagen-Katalog im Create-Dialog (Schritt 2)**
  - Nach Name-Eingabe + Bestätigung: zweiter Schritt im selben Dialog
  - Auswahl: "Leer starten" oder Vorlage aus Katalog
  - Vorlagen-Auswahl legt Template direkt an (Name = Vorlagenname, editierbar)
  - Vorlagen-Name wird als Template-Name vorausgefüllt
  - **Aufwand:** 30 Min
  - **Commit:** `feat: add template catalog step to create dialog`

- [x] **Vorlagen-Definitionen anlegen**
  - Datei: `src/data/templateCatalog.ts`
  - 4 Vorlagen mit vordefinierten Blöcken:
    1. **Allgemeines Schmerz-Tagebuch** – Datum, Schmerzstärke (Slider 0–10), Notizen
    2. **Chronischer Schmerz** – Datum, Schmerzstärke, Funktionsfähigkeit (Slider), Schlaf (Slider), Stimmung (Slider), Notizen
    3. **Migräne-Tracking** – Datum, Schmerzstärke, Begleitsymptome (MultiSelect: Übelkeit/Aura/Lichtempfindlichkeit/Lärmempfindlichkeit), Dauer (Slider), Auslöser (MultiSelect), Notizen
    4. **Kopfschmerz-Tagebuch** – Datum, Schmerzstärke, Schmerzart (MultiSelect: Dumpf/Pochend/Stechend/Drückend), Medikamente (MultiSelect), Auslöser (MultiSelect), Notizen
  - Jede Vorlage mit: `name`, `icon`, `blocks[]`
  - **Aufwand:** 20 Min
  - **Commit:** `feat: define template catalog with 4 presets`

- [x] **Vorlagen-Auswahl UI**
  - Grid mit Vorlagen-Cards (Icon + Name + kurze Beschreibung)
  - Plus: "Leer starten"-Card als erste Option
  - Klick → direkt anlegen, Editor öffnet sich mit Vorlage
  - **Aufwand:** 20 Min
  - **Commit:** `feat: add template catalog UI to create dialog`

### 6.9: Icon Picker Lucide-Integration (1.5h) ✅ KOMPLETT
**Branch:** `feature/lucide-icon-picker`
**Status:** Abgeschlossen (17.02.2026)

**Ziel:** Zugriff auf alle 1,500+ Lucide Icons mit Suchfunktion

**Tasks:**

- [x] **Icon-Namen extrahieren & Rendering-Guard**
  - `iconUtils.ts` neu erstellt
  - `isRenderableComponent()`: filtert forwardRef-Objekte korrekt von Nicht-Komponenten
  - `AVAILABLE_ICON_NAMES`: CamelCase-Namen ohne `Icon`-Suffix, ohne `Lucide`-Prefix
  - **Commit:** `feat: extract lucide icon names for picker`

- [x] **Icon-Browser UI in TemplateStylePicker**
  - Collapsible Panel mit Search-Input
  - Grid: responsive, `.icon-picker-grid` CSS-Klasse
  - Aktuell ausgewähltes Icon farbig highlighten (Template-Farbe)
  - **Commit:** `feat: create icon browser UI with grid layout`

- [x] **Search-Filter implementiert**
  - Echtzeit-Suche (onChange), case-insensitiv
  - Ohne Suche: max. 120 Icons (Performance-Limit)
  - Mit Suche: alle Treffer aus ~1500 Icons
  - Hinweis-Text: "120 von X Icons — suche nach Name für mehr"
  - **Commit:** `feat: implement icon search filter`

- [x] **Icon-Rendering & Selection**
  - `getIconComponent(name)`: exakter Treffer → case-insensitiver Fallback → BookOpen
  - `React.createElement` statt JSX (sicherer bei dynamischen Komponenten)
  - Icon-Name (CamelCase) wird in DB gespeichert
  - **Commit:** `feat: implement icon rendering and selection`

- [x] **Integration in TemplateStylePicker + db.ts**
  - Icon-Button öffnet Picker, zeigt aktuelles Icon (28px)
  - Default-Icons in `db.ts` auf CamelCase migriert (z.B. `'Flame'`, `'Brain'`)
  - **Commit:** `feat: integrate lucide icon picker into template style picker`

- [x] **Bugfixes: Vite lazy-getter & Performance**
  - Root Cause: Vite bundelt lucide-react mit `__export()` lazy getters → vorab kopierte Map enthielt `undefined`-Einträge
  - Fix: `getIconComponent` schlägt Icons direkt zur Laufzeit nach (kein Vorab-Kopieren in Map)
  - Fix: `isRenderableComponent()` prüft `$typeof` für forwardRef-Objekte
  - Fix: Performance-Limit 120 Icons initial verhindert 579ms Click-Lag
  - **Commit:** `fix: resolve vite lazy-getter issue and icon render crash`

### 6.10: BodyMap Block-spezifische Presets & Default-Vorlagen (4h)
**Branch:** `feature/bodymap-block-presets`
**Status:** Geplant (18.02.2026)

**Ziel:** Jeder BodyMapBlock kann seine eigene Standard-Vorlage haben; Vorlagen-Manager im Editor

**KONTEXT:**
- 2 BodyMapBlocks im selben Template sollen UNTERSCHIEDLICHE Default-Presets laden können
- Block A: "Vorderseite" lädt automatisch "Körper Vorderseite"-Preset
- Block B: "Rückseite" lädt automatisch "Körper Rückseite"-Preset
- Aktuelle Architektur: `isDefault` ist GLOBAL → funktioniert nicht für mehrere Blocks
- Neue Architektur: `block.bodyMapConfig.defaultPresetId` pro Block

**Tasks:**

- [ ] **Block-Interface erweitern (15 Min)**
  ```typescript
  // types/blocks.ts
  interface Block {
    // ... existing properties
    bodyMapConfig?: {
      defaultPresetId?: string;  // Welches Preset ist Default für DIESEN Block
    };
  }
  ```
  - **Commit:** `feat: add bodyMapConfig to Block interface`

- [ ] **bodymapPresets.ts: isDefault entfernen (15 Min)**
  ```typescript
  export interface BodyMapPreset {
    id: string;
    name: string;
    image: string;
    // isDefault: boolean; ← ENTFERNEN (wird jetzt pro Block gespeichert)
  }
  ```
  - `setDefaultPreset()` und `getDefaultPreset()` ENTFERNEN
  - Bestehende Presets mit `isDefault` werden zu normalen Presets migriert
  - **Commit:** `refactor: remove global isDefault from bodyMapPreset interface`

- [ ] **BodyMapBlock: "Als Standardvorlage"-Button (30 Min)**
  - Neuer Button neben "Als Vorlage" (Star-Icon)
  - Prüft ob aktuelles Bild als Preset existiert
  - Falls NEIN: Auto-Speichern mit Namen `${block.label} - Standard`
  - Falls JA: Verwendet existierende Preset-ID
  - Ruft `onConfigChange({ defaultPresetId })` auf
  - **Commit:** `feat: add set as default preset button to bodymap block`

- [ ] **BodyMapBlock: Default-Preset-Laden mit Edge Case Handling (20 Min)**
  ```typescript
  useEffect(() => {
    setPresets(getPresets());
    
    if (!data.image && !readOnly && !hideLabel) {
      const defaultPresetId = block.bodyMapConfig?.defaultPresetId;
      
      if (defaultPresetId) {
        const preset = getPresets().find(p => p.id === defaultPresetId);
        if (preset) {
          // Default-Preset gefunden → laden
          updateData({ image: preset.image, points: [] });
        }
        // Preset gelöscht → Fallback zu normaler Ansicht
      }
      // Kein Default ODER Preset nicht gefunden → Zeige Vorlage-Auswahl oder Upload
    }
  }, []);
  ```
  - **Commit:** `feat: implement block-specific default preset loading`

- [ ] **BodyMapBlock: Vorlagen-Manager UI (30 Min)**
  - Nur im Editor sichtbar (`hideLabel === true`)
  - Card mit Liste aller Presets
  - Jeder Preset: Name + Lösch-Button (Trash-Icon)
  - Standard-Preset mit ⭐ markiert
  - Position: Unterhalb der Button-Reihe (Bild ändern, Als Vorlage, etc.)
  ```tsx
  {hideLabel && presets.length > 0 && (
    <Card className="p-3 bg-secondary/30">
      <Label className="text-sm mb-2 block">Gespeicherte Vorlagen</Label>
      <div className="space-y-2">
        {presets.map(preset => (
          <div key={preset.id} className="flex items-center justify-between p-2 bg-background rounded border">
            <span className="text-sm flex-1">
              {preset.name}
              {block.bodyMapConfig?.defaultPresetId === preset.id && (
                <span className="ml-2 text-xs text-yellow-600">⭐ Standard</span>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeletePreset(preset.id)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )}
  ```
  - **Commit:** `feat: add preset manager ui to bodymap block editor`

- [ ] **BodyMapBlock: handleDeletePreset mit Confirmation (20 Min)**
  - Dialog-Confirmation vor Löschen
  - Falls gelöschtes Preset = Default-Preset → `onConfigChange({ defaultPresetId: undefined })`
  - Aktualisiert lokalen `presets` State
  - **Commit:** `feat: add preset deletion with confirmation dialog`

- [ ] **BodyMapBlock: onConfigChange Callback (15 Min)**
  ```typescript
  interface BodyMapBlockProps {
    block: Block;
    onChange: (value: string) => void;
    onPresetSaved?: () => void;
    onConfigChange?: (config: { defaultPresetId?: string }) => void; // ← NEU
    readOnly?: boolean;
    hideLabel?: boolean;
  }
  ```
  - **Commit:** `feat: add onConfigChange callback to bodymap block`

- [ ] **BlockRenderer: onConfigChange durchreichen (10 Min)**
  ```typescript
  interface BlockRendererProps {
    // ... existing props
    onConfigChange?: (config: { defaultPresetId?: string }) => void;
  }
  
  case 'bodymap':
    return (
      <BodyMapBlock 
        block={block} 
        onChange={onChange} 
        onPresetSaved={onPresetSaved}
        onConfigChange={onConfigChange} // ← NEU
        readOnly={readOnly} 
        hideLabel={hideLabel} 
      />
    );
  ```
  - **Commit:** `feat: pass onConfigChange through BlockRenderer`

- [ ] **DiaryView: handleBlockConfigChange (20 Min)**
  ```typescript
  function handleBlockConfigChange(blockId: string, config: { defaultPresetId?: string }) {
    setCurrentBlocks(prev => 
      prev.map(block => 
        block.id === blockId 
          ? { 
              ...block, 
              bodyMapConfig: { 
                ...block.bodyMapConfig, 
                ...config 
              } 
            }
          : block
      )
    );
  }
  
  <BlockRenderer
    key={block.id}
    block={block}
    onChange={(value) => handleBlockChange(block.id, value)}
    onDashboardConfigChange={handleDashboardConfigChange}
    onPresetSaved={handlePresetSaved}
    onConfigChange={(config) => handleBlockConfigChange(block.id, config)} // ← NEU
    hideLabel={block.hideLabelInDiary}
  />
  ```
  - **Commit:** `feat: add block config change handler to DiaryView`

- [ ] **EditorMode: handleBlockConfigChange (20 Min)**
  - Gleiche Logik wie DiaryView
  - Aktualisiert `editingBlocks` State
  - Config wird im Template gespeichert beim Save
  - **Commit:** `feat: add block config change handler to EditorMode`

- [ ] **UI-Feedback: Aktiver "Standard"-Button (15 Min)**
  - "Als Standardvorlage"-Button zeigt visuell ob aktuelles Bild = Default
  - Gelber Hintergrund + Star-Icon gefüllt wenn aktiv
  - **Commit:** `feat: add visual feedback for active default preset button`

- [ ] **Testing: Multi-Block-Szenarien (40 Min)**
  - 2 BodyMapBlocks im selben Template
  - Unterschiedliche Default-Presets setzen
  - Presets löschen (inkl. Default-Preset)
  - DiaryView neu laden → Default-Presets werden korrekt geladen
  - **Commit:** `test: verify block-specific preset system with multiple blocks`

**Edge Cases:**
- ✅ **Default-Preset gelöscht:** Block fällt zurück auf Vorlage-Auswahl oder Upload-Button
- ✅ **Keine Presets vorhanden:** Normale Upload-Ansicht wird angezeigt
- ✅ **Preset-Name-Kollision:** Auto-Namen bekommen Timestamp-Suffix

**Breaking Changes:**
- ✅ KEINE - `bodyMapConfig` ist optional, alte Blocks funktionieren weiter
- ✅ Alte Presets mit `isDefault` werden automatisch migriert (Flag wird ignoriert)

**Aufwandsschätzung:** ~4h
**DB-Migration:** KEINE (nur Block-Schema erweitert, keine DB-Änderung nötig)

### 6.11: BodyMap Bild-Zuschneidetool (2.5h) 🆕
**Branch:** `feature/bodymap-image-crop`
**Status:** In Arbeit (18.02.2026)
**Dependency:** `react-easy-crop` (bereits installiert)

**Ziel:** Bild-Zuschneidetool für BodyMapBlock mit Touch-optimierter UI

**KONTEXT:**
- User kann hochgeladene Bilder direkt im BodyMapBlock zuschneiden
- Touch-optimiert für Mobile (Zoom + Pan)
- Beim Zuschneiden werden ALLE Schmerzpunkte gelöscht (Koordinaten ungültig)
- Button-Größe: wie TextArea Event-Button (44x44px, nur Icon)

**Tasks:**

- [ ] **Crop-Button UI (15 Min)**
  - Icon: Scissors (lucide-react)
  - Position: Nach "Als Standardvorlage", vor "Alles löschen"
  - Nur sichtbar wenn `data.image` vorhanden
  - Größe: 44x44px (wie TextArea Event-Button)
  - Nur Icon, kein Text
  - **Commit:** `feat: add crop button to bodymap block`

- [ ] **Crop-Modal State Management (15 Min)**
  ```typescript
  const [showCropModal, setShowCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  ```
  - **Commit:** `feat: add crop modal state management`

- [ ] **Crop-Modal UI mit react-easy-crop (45 Min)**
  ```tsx
  import Cropper from 'react-easy-crop'
  
  {showCropModal && (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex-1 relative">
        <Cropper
          image={data.image}
          crop={crop}
          zoom={zoom}
          aspect={4/3}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>
      <div className="p-4 bg-background">
        <Label>Zoom</Label>
        <Slider value={[zoom]} onValueChange={(val) => setZoom(val[0])} min={1} max={3} step={0.1} />
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => setShowCropModal(false)}>Abbrechen</Button>
          <Button onClick={handleApplyCrop}>Übernehmen</Button>
        </div>
      </div>
    </div>
  )}
  ```
  - Fullscreen Modal (Mobile-optimiert)
  - Cropper Component mit Zoom-Slider
  - Abbrechen / Übernehmen Buttons
  - **Commit:** `feat: implement crop modal ui with react-easy-crop`

- [ ] **getCroppedImg Utility-Funktion (30 Min)**
  ```typescript
  async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<string> {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );
    
    return canvas.toDataURL('image/jpeg', 0.85);
  }
  
  function createImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', error => reject(error));
      image.src = url;
    });
  }
  ```
  - Canvas-basierte Crop-Logic
  - JPEG Kompression (quality: 0.85)
  - Promise-basiert
  - **Commit:** `feat: implement getCroppedImg utility function`

- [ ] **handleApplyCrop mit Warnung (20 Min)**
  ```typescript
  async function handleApplyCrop() {
    if (!croppedAreaPixels || !data.image) return;
    
    // Warnung wenn Schmerzpunkte vorhanden
    if (data.points.length > 0) {
      if (!confirm('⚠️ Beim Zuschneiden gehen alle Markierungen verloren!\n\nMöchtest du fortfahren?')) {
        return;
      }
    }
    
    const croppedImage = await getCroppedImg(data.image, croppedAreaPixels);
    updateData({ image: croppedImage, points: [] });
    setShowCropModal(false);
  }
  ```
  - Confirmation-Dialog wenn Schmerzpunkte existieren
  - Schmerzpunkte werden gelöscht (Koordinaten ungültig)
  - Modal schließen nach Crop
  - **Commit:** `feat: implement crop apply handler with point warning`

- [ ] **handleCropComplete Callback (10 Min)**
  ```typescript
  function handleCropComplete(croppedArea: Area, croppedAreaPixels: Area) {
    setCroppedAreaPixels(croppedAreaPixels);
  }
  ```
  - Speichert Crop-Koordinaten
  - **Commit:** `feat: add crop complete callback`

- [ ] **Icon Import + Button Integration (15 Min)**
  ```typescript
  import { Scissors } from 'lucide-react';
  
  <Button variant="outline" onClick={() => setShowCropModal(true)} type="button">
    <Scissors size={16} />
  </Button>
  ```
  - Scissors Icon importieren
  - Button ohne Text (nur Icon)
  - **Commit:** `feat: integrate crop button with scissors icon`

- [ ] **Testing & Mobile UX (30 Min)**
  - Touch-Zoom testen
  - Pan-Gesten testen
  - Crop-Ergebnis Qualität prüfen
  - Confirmation-Dialog auf Mobile testen
  - Performance bei großen Bildern
  - **Commit:** `test: verify crop tool mobile ux and performance`

**Edge Cases:**
- ✅ **Keine Schmerzpunkte:** Direktes Zuschneiden ohne Warnung
- ✅ **Schmerzpunkte vorhanden:** Confirmation-Dialog mit expliziter Warnung
- ✅ **Crop abbrechen:** Modal schließen, Bild bleibt unverändert
- ✅ **Große Bilder:** JPEG Kompression verhindert zu große Base64-Strings

**Aufwandsschätzung:** ~2.5h
- Button UI: 15 Min
- State Management: 15 Min
- Modal UI: 45 Min
- getCroppedImg: 30 Min
- Apply Handler: 20 Min
- Crop Complete: 10 Min
- Icon Integration: 15 Min
- Testing: 30 Min

**Dependencies:**
- ✅ `react-easy-crop` bereits installiert

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

### CSS / Browser
- [ ] **CSS Hyphens: Silbentrennung nicht konsistent**
  - Problem: `hyphens: auto` ist korrekt implementiert, aber Browser wenden Silbentrennung nur bei sehr langen Wörtern an (≥13 Zeichen)
  - Aktuelle Texte ("Schmerzlokalisierung", "Mehrfachauswahl") passen meist ohne Trennung auf neue Zeile
  - Zeilenumbruch funktioniert korrekt mit `word-wrap: break-word`
  - Browser-abhängig: Silbentrennung greift nur wenn Wort ~60-70% der Container-Breite einnimmt
  - Location: `.block-palette-description` in `components.css`
  - **Priorität:** SEHR NIEDRIG (Kosmetisch, funktioniert wie vorgesehen)

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

**Aktuelle Priorisierung (18.02.2026):**
1. ✅ Phase 6.3d: MultiSelect Collapsible (KOMPLETT)
2. ✅ Phase 6.3c: Lösch-Bestätigung (KOMPLETT)
3. ✅ Phase 6.7: TextArea-Erweiterung (KOMPLETT)
4. ✅ Phase 6.7b: Icon-Größen iOS-konform (KOMPLETT)
5. ✅ Phase 6.4: Global DnD Modus (KOMPLETT)
6. ✅ Phase 6.5: Dropdown-Redesign/Unified Containers (KOMPLETT)
7. ✅ DB Version 13: Image-Block aus Standard-Template entfernt
8. ✅ Phase 6.9: Icon Picker Lucide (KOMPLETT)
9. ✅ Phase 6.4: Modal-System Vereinheitlichung (KOMPLETT)
10. ✅ Phase 6.8: Standard-Template Auto-Generierung + Vorlagen-Katalog (KOMPLETT)
11. 🚀 Phase 6.10: BodyMap Block-spezifische Presets (IN ARBEIT)
12. Phase 6.6: Template-Switcher
13. Phase 8: Code Cleanup

**Dann:** Phase 8 (Code Cleanup) vor weiteren Features

---

**Letzte Aktualisierung:** 18.02.2026  
**Aktueller Stand:** Phase 6.10 in Arbeit (BodyMap Block-spezifische Presets & Default-Vorlagen)  
**Nächster Schritt:** Task 1 - Block-Interface erweitern  
**DB Version:** 14  
**Status:** 🚀 ROADMAP AKTUALISIERT - BEREIT FÜR UMSETZUNG
