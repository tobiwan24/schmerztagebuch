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

### Phase 1-5: Core Features, Dashboard UI, Template-Editor Basis (KOMPLETT)
### Phase 6: Editor UX Improvements (KOMPLETT)
- ✅ Phase 6.1-6.5: Quick Wins, Visuelle Trennung, Block-Aktionen, Global DnD
- ✅ Phase 6.6: Template-Switcher ✅ KOMPLETT (18.02.2026)
- ✅ Phase 6.7-6.11: TextArea-Erweiterung, Icon Picker, Standard-Template, BodyMap Features

### Phase 11.6: Tutorial-Guide System (IN ARBEIT)
- ✅ TutorialContext + PageTutorial-Komponente (spotlightExcludeTop, spotlightFullBottom, spotlightToggle, extraDelay)
- ✅ DiaryView Tutorial: 5 Steps (Bottombar, Content, Save, Menü, Personalisieren-Scroll)
- ✅ EditorMode Tutorial: 9 Steps (Header, Collapsible, Nav-Pfeile, Baustein hinzufügen, Baustein, Collapsible, DnD, Neue Vorlage, Löschen)
- ✅ Template-Katalog: BodyMap-Block in Allgemeines Schmerz-Tagebuch (19.02.2026)

---

## 🔥 PHASE 11: CRITICAL FEATURES (HIGH PRIO - NEXT)

**Priorität:** HOCH - Produktionsreife Features vor Release

### 11.1: Verlauf-Page Optimierung (3-4h)
**Branch:** `feature/history-view-optimization`
**Priorität:** HOCH

**Ziel:** HistoryView benutzerfreundlicher machen mit besseren Filtern und Export-Optionen

#### Tasks:

- [ ] **Filter-Container verschlanken (1h)**
  - Aktueller Zustand prüfen (HistoryView.tsx analysieren)
  - Filter kompakter gestalten (Collapsible Sections?)
  - Mobile-optimiertes Layout
  - **Commit:** `refactor: streamline history view filter container`

- [ ] **Filtertypen erweitern (1.5h)**
  - **Nach Template filtern** (Dropdown/Multi-Select)
  - **Nach Zeitraum** (DatePicker Range wie Dashboard)
  - **Nach Event-Typ** (Arztbesuch/Event)
  - **Suche** (Freitext in Notizen)
  - Filter-Kombinationen ermöglichen
  - **Commit:** `feat: add advanced filters to history view`

- [ ] **PDF-Export optimieren (1-1.5h)**
  - **Bildgröße-Option** (Klein/Mittel/Groß)
  - **Darstellungsform-Auswahl:**
    - Tabelle (Standard)
    - Zeitstrahl aller Events/Arztbesuche
    - Template-gruppiert
  - Layout-Vorschau vor Export (optional)
  - **Commit:** `feat: enhance pdf export with size and layout options`

**Offene Fragen:**
- Sollen Filter persistent gespeichert werden (Settings)?
- PDF-Library: Aktuell welche? jsPDF? pdfmake?

---

### 11.2: Dashboard Export-Funktionen (2-3h)
**Branch:** `feature/dashboard-export`
**Priorität:** HOCH

**Ziel:** Charts als Bild/PDF exportieren für Arztgespräche

#### Tasks:

- [ ] **Export als Bild (PNG) (1h)**
  - ApexCharts `exportChart()` API nutzen
  - Export-Button im Dashboard-Header
  - Dateiname: `schmerzverlaeufe_YYYY-MM-DD.png`
  - Auflösung: 1920x1080 (Full HD)
  - **Commit:** `feat: add chart export as png image`

- [ ] **Export als PDF (1-1.5h)**
  - Chart als Bild rendern → in PDF einbetten
  - Header mit Zeitraum und Template-Namen
  - Statistiken inkl. (falls vorhanden)
  - Event-Liste als Anhang (optional)
  - **Commit:** `feat: add chart export as pdf`

- [ ] **Integration in Verlauf-Export (30 Min)**
  - Chart-Export-Code wiederverwendbar machen
  - In HistoryView PDF-Export integrieren
  - Charts als Anhang zu Zeitstrahl-PDF
  - **Commit:** `refactor: integrate chart export into history pdf`

**Technische Details:**
```typescript
// ApexCharts Export API
chart.dataURI().then(({ imgURI }) => {
  const link = document.createElement('a');
  link.download = `chart_${Date.now()}.png`;
  link.href = imgURI;
  link.click();
});
```

---

### 11.3: HomePage UI Überarbeitung (3-4h)
**Branch:** `HomePageUI-Refactoring`
**Priorität:** HOCH

**Ziel:** HomePage aufräumen und visuell ansprechender machen

#### 🐛 Probleme (aktuell):
- Template-Icons nicht zentriert bei 2 Templates
- Layout wirkt leer bei wenigen Templates
- Keine visuelle Hierarchie
- **Responsive Issue (Chrome):** Buttons riesig und überlagert in voller Breite
- **Template-Buttons:** Werden oval statt rund gerendert

#### Tasks:

- [ ] **Responsive Layout-Fix (1h)** ⚠️ KRITISCH
  - **Problem:** Buttons in Chrome überlagert und zu groß
  - **Problem:** Template-Buttons oval statt rund
  - **Fix:** CSS Grid/Flexbox anpassen für verschiedene Viewports
  - **Fix:** `aspect-ratio: 1` für runde Template-Buttons erzwingen
  - Breakpoints prüfen (Mobile, Tablet, Desktop)
  - Button-Größen konsistent (max-width/max-height)
  - **Nur HomePage.tsx betroffen!**
  - **Commit:** `fix: resolve homepage responsive layout issues on chrome`

- [ ] **Template-Grid zentrieren (30 Min)**
  - CSS-Fix: `justify-items: center` oder Flexbox
  - Responsive: 2 Spalten mobil, 3-4 Desktop
  - Touch-Targets: Min. 120x120px pro Card
  - **Commit:** `fix: center template icons on homepage grid`

- [ ] **Visuelles Redesign (1-1.5h)**
  - Glassmorphismus konsistent (wie DiaryView)
  - Template-Cards mit Hover-Effekt
  - Icon-Größe: 48px → 56px (besser sichtbar)
  - Template-Name: Prominent unter Icon
  - Entry-Count Badge (optional: "12 Einträge")
  - **Commit:** `style: redesign homepage template cards`

- [ ] **Hintergrund-Austausch (45 Min - optional)**
  - **Aktuell:** Statischer Hintergrund
  - **Optionen evaluieren:**
    - **Option 1 - Iridescence** (reactbits.dev)
      ```tsx
      import Iridescence from './Iridescence';
      
      <Iridescence
        color={[0.5,0.6,0.8]}
        mouseReact={false}
        amplitude={0.1}
        speed={0.4}
      />
      ```
    - **Option 2 - Grainient** (reactbits.dev)
      - Körnung + Gradient-Effekt
    - **Option 3 - Pastelltöne Custom**
      - Nah an App-Design angelehnt
      - Weiche bewegende Flächen
      - CSS Animationen (keyframes)
  - User-Entscheidung: Welche Option?
  - **Commit:** `feat: add animated background to homepage`

- [ ] **Empty State verbessern (30 Min)**
  - Falls keine Templates: Onboarding-Hinweis
  - "Erstes Template erstellen" CTA
  - Illustration oder Icon (optional)
  - **Commit:** `feat: improve homepage empty state`

- [ ] **Quick-Actions hinzufügen (30 Min - optional)**
  - "Neues Template" Button prominent
  - "Backup erstellen" Shortcut
  - "Einstellungen" Shortcut
  - **Commit:** `feat: add quick actions to homepage`

#### ❓ Offene Fragen:

1. **Hintergrund-Wahl:**
   - Option 1 (Iridescence) - Holographischer Effekt?
   - Option 2 (Grainient) - Körnung + Gradient?
   - Option 3 (Custom) - Pastelltöne mit weichen Flächen?

2. **Animation-Geschwindigkeit:**
   - Langsam (speed: 0.2) - Subtil?
   - Mittel (speed: 0.4) - Ausgewogen?
   - Schnell (speed: 0.8) - Dynamisch?

---

### 11.4: Datenpersistenz & Backup-System (4-6h)
**Branch:** `feature/data-backup-system`
**Priorität:** KRITISCH - Verhindert Datenverlust

**Kontext:** Vollständige Spezifikationen aus Chat-Analyse

#### 📋 Problem-Analyse (DOKUMENTIERT):

**Hauptproblem:**
- **IndexedDB wird bei Browser-Cleanup gelöscht** (iOS Safari, Android Chrome)
- **Kompletter Datenverlust** möglich ohne User-Warnung
- **Betroffene Plattformen:** Hauptsächlich iPhone Safari

**Impact:**
- Alle Tagebucheinträge verloren
- Alle Templates verloren
- Dashboard-Konfiguration verloren
- Auth-Key verloren (bei Verschlüsselung)

#### 💡 Lösungsansätze (EVALUIERT):

**1. File System Access API** ❌
- **Idee:** Daten in user-accessible Datei speichern
- **Pro:** User hat volle Kontrolle, kein Browser-Cleanup
- **Contra:** **Nicht auf iOS Safari unterstützt** (Deal-Breaker!)
- **Status:** Nicht umsetzbar für iOS

**2. Automatischer Backup & Restore** ✅ (EMPFOHLEN - Quick-Win)
- **Export-Mechanismus:**
  - Nach X Einträgen: "Backup erstellen?" Notification
  - Settings: "Backup erstellen" Button prominent
  - Export als `.json` mit Timestamp
  - Download in lokalen Downloads-Ordner
  
- **Import-Mechanismus:**
  - Bei leerem DB: "Backup wiederherstellen?" Banner
  - Drag & Drop für `.json` Import
  - Validierung & Fehlerbehandlung
  
- **Herausforderungen:**
  - iOS: Kein direkter File-System Access
  - User muss Backup **manuell** anlegen/wiederherstellen
  - Nicht truly automatic

**3. Passwort-Manager Integration** 🔍 (RESEARCH NEEDED)
- **Idee:** Auth-Key in iOS Keychain / Android Keystore
- **Pro:** Sicher, persistent, system-integriert
- **Research nötig:**
  - Web Crypto API + Keychain Integration?
  - PWA Capabilities für Keychain-Access?
  - Capacitor Plugin nötig? (→ dann keine reine PWA mehr)
- **Machbarkeit:** Zu prüfen, evtl. nicht als PWA möglich
- **Status:** Spätere Version (v2.0+)

**4. Cloud Sync (langfristig)** 🔮 (FUTURE)
- **Idee:** Daten in Cloud speichern (E2E-verschlüsselt)
- **Pro:** Geräte-übergreifend, automatisches Backup
- **Contra:** Komplexität, Backend nötig, Datenschutz-Bedenken
- **Status:** Future Feature (Phase 12+)

#### 🎯 Implementierungs-Plan (Quick-Win Ansatz):

- [ ] **Export-Button in Settings (1h)**
  ```typescript
  async function exportBackup() {
    const data = {
      templates: await getTemplates(),
      entries: await getEntries(),
      settings: await getSettings(),
      version: DB_VERSION,
      exportedAt: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `schmerztagebuch_backup_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
  }
  ```
  - Button-Platzierung: Oberster Bereich in Settings
  - Icon: Download/CloudDownload
  - Prominent mit Hinweis-Text
  - **Commit:** `feat: add manual backup export to settings`

- [ ] **Import-Funktion (1.5h)**
  - File-Input in Settings
  - Drag & Drop Zone (optional)
  - JSON-Validierung (Schema-Check)
  - Fehlerbehandlung (korrupte Dateien)
  - Bestätigung vor Überschreiben
  - **Commit:** `feat: add backup import with validation`

- [ ] **Export-Reminder System (1.5h)**
  ```typescript
  // Nach X Einträgen (z.B. 10, 50, 100):
  if (entriesCount % 25 === 0 && entriesCount > 0) {
    showNotification({
      title: "💾 Backup empfohlen",
      message: `Du hast bereits ${entriesCount} Einträge. Sichere deine Daten!`,
      action: "Jetzt Backup erstellen"
    });
  }
  ```
  - Reminder-Intervalle: 10, 25, 50, 100 Einträge
  - Settings: Reminder aktivieren/deaktivieren
  - Snooze-Funktion (7 Tage)
  - **Commit:** `feat: add backup reminder notification system`

- [ ] **Empty-DB Detection & Banner (1h)**
  - Bei App-Start: DB-Größe prüfen
  - Falls leer: Banner "Backup wiederherstellen?"
  - Direkt zu Import-Dialog
  - Dismissable (LocalStorage-Flag)
  - **Commit:** `feat: add restore backup banner for empty database`

- [ ] **LocalStorage Fallback (1h - optional)**
  - Komprimiertes Backup in LocalStorage
  - Max. 5MB (Browser-Limit beachten)
  - Automatisch alle 24h aktualisieren
  - Bei IndexedDB-Verlust: Auto-Restore Prompt
  - **Commit:** `feat: add localstorage backup fallback`

#### ❓ Offene Fragen (zu klären):

1. **Export-Reminder Frequenz:**
   - Nach wie vielen Einträgen? (Vorschlag: 10, 25, 50, 100)
   - User-konfigurierbar?

2. **Backup-Format:**
   - JSON (lesbar, editierbar) ✅
   - Verschlüsseltes JSON (wenn Encryption aktiv)?

3. **Auto-Backup Konzept:**
   - LocalStorage als Fallback nutzen? (Größen-Limit!)
   - Oder nur manuelles Backup-System?

4. **Import-UX:**
   - Drag & Drop als primär?
   - Klassischer File-Input als Fallback?

5. **Passwort-Manager Integration:**
   - Weiter recherchieren für v2.0?
   - Oder vorerst nur Backup-System?

---

### 11.5: BodyMap Bildgrößen-Optimierung (2-3h)
**Branch:** `feature/bodymap-image-optimization`
**Priorität:** MITTEL

**Ziel:** BodyMap Bilder in sinnvoller Größe begrenzen für Performance & Export

#### 📋 Problem-Analyse:

**Aktueller Zustand:**
- Bilder können beliebig groß sein (Performance-Problem)
- Bei großen Displays: Riesige Canvas-Größen
- Export: Bilder zu groß für PDF (A5-Format)
- Punkt/Pinsel-Größen inkonsistent bei verschiedenen Bildgrößen
- Beschriftungen unterschiedlich groß

**Anforderungen:**
- Container darf nie größer sein als Viewport
- Punkt/Pinsel-Tools müssen oben sichtbar sein
- Buttons (Bild ändern, etc.) müssen unten sichtbar sein
- Kommentare/Legende können außerhalb scrollen
- Einheitliche Größe für konsistentes Rendering

#### 🎯 Lösungsansatz:

**Option A: Viewport-basierte Begrenzung** (EMPFOHLEN)
```typescript
const MAX_BODYMAP_HEIGHT = window.innerHeight * 0.6; // 60% Viewport
const MAX_BODYMAP_WIDTH = window.innerWidth - 40; // -40px für Padding
```

**Option B: Feste Standardgröße**
```typescript
const BODYMAP_STANDARD_SIZE = {
  width: 600,  // px
  height: 800  // px (4:3 oder 3:4 Ratio)
};
```

#### Tasks:

- [ ] **Bildgrößen-Begrenzung implementieren (1h)**
  - Entscheidung: Viewport-basiert ODER feste Größe
  - Resize beim Upload (Canvas-basiert)
  - Max-Width/Max-Height CSS-Constraints
  - Aspect-Ratio beibehalten
  - **Commit:** `feat: implement bodymap image size constraints`

- [ ] **Punkt/Pinsel Rendering anpassen (45 Min)**
  - Größen relativ zur Bildgröße berechnen
  - Einheitliche Skalierung bei verschiedenen Bildgrößen
  - Punkt-Radius: z.B. `imageWidth * 0.02` (2% der Bildbreite)
  - Pinsel-Größe analog
  - **Commit:** `feat: scale point and brush sizes relative to image`

- [ ] **Beschriftungs-Größen vereinheitlichen (30 Min)**
  - Font-Size relativ zur Bildgröße
  - Mindestgröße: 12px, Maximalgröße: 20px
  - Lesbarkeit auf allen Devices
  - **Commit:** `feat: unify label font sizes on bodymap`

- [ ] **PDF-Export Optimierung (45 Min)**
  - Bilder auf A5-Größe reduzieren (148 × 210 mm)
  - Seitenverhältnis: Hochformat bevorzugen
  - Optional: Export-Dialog mit Größenauswahl
    - Klein (A6): 105 × 148 mm
    - Mittel (A5): 148 × 210 mm
    - Groß (A4): 210 × 297 mm
  - **Commit:** `feat: optimize bodymap images for pdf export`

- [ ] **Container Layout-Fix (30 Min)**
  - BodyMap Container: `max-height: calc(100vh - 200px)`
  - Tools oben fixiert (Sticky)
  - Buttons unten fixiert (Sticky) 
  - Bild scrollbar falls nötig
  - **Commit:** `fix: ensure bodymap fits viewport with visible tools`

#### ❓ Offene Fragen (zu klären):

1. **Größen-Strategie:**
   - Viewport-basiert (responsive) ODER feste Größe (konsistent)?
   - Feste Größe Vorschlag: 600×800px (gut für Mobile + Desktop)?

2. **PDF-Export:**
   - Automatisch auf A5 reduzieren ODER User-Auswahl?
   - Separate Export-Optionen für Verlauf vs. einzelnes Entry?

3. **Aspect Ratio:**
   - Frei wählbar (wie bisher) ODER Standardverhältnis erzwingen (3:4)?

---

### 11.6: Tutorial-Guide System (6-8h)
**Branch:** `feature/tutorial-guide-system`
**Priorität:** HOCH - Onboarding für neue User

**Ziel:** Intelligenter Tutorial-Guide der neue User durch die App führt

#### 📋 Entscheidungen (18.02.2026):

**1. Design-Ansatz:** ✅ HYBRID
- Spotlight-Overlays für wichtige Elemente (minimal, fokussiert)
- Inline-Banner für fortlaufende Tipps (subtil, dauerhaft)

**2. Tutorial-Start:** ✅ NACH SETUP-WIZARD
- Automatisch beim ersten Besuch der DiaryView
- Reaktivierbar über Settings → "Tutorial neu starten"

**3. Content-Länge:** ✅ BEST PRACTICE (1-2 Sätze)
- Kurze, prägnante Tipps (1-2 Sätze pro Page)
- Fokus auf essenzielle Features
- Mobile-optimiert, schnell erfassbar

**4. Animationen:** ✅ ALLE AKTIVIERT
- Fade-In/Out für Overlays (150ms)
- Spotlight-Pulsieren für Aufmerksamkeit (2s Intervall)
- Scroll-to-Element automatisch (smooth behavior)

**5. Aufwand-Budget:** ✅ HYBRID (6-8h)
- Bei Bedarf iterative Nachbesserung

---

#### 🎯 Implementierungs-Plan:

**A. TutorialProvider Context (1h)**
```typescript
// src/contexts/TutorialContext.tsx
interface TutorialState {
  globalDisabled: boolean;
  pageDisabled: {
    home: boolean;
    diary: boolean;
    editor: boolean;
    dashboard: boolean;
    history: boolean;
    settings: boolean;
  };
  completedSteps: string[]; // z.B. ['home-step-1', 'diary-step-2']
  lastShown: Date;
}

interface TutorialContextType {
  state: TutorialState;
  showTutorial: (page: string, step: string) => boolean;
  dismissPage: (page: string) => void;
  dismissGlobally: () => void;
  resetTutorials: () => void;
  markStepCompleted: (step: string) => void;
}
```
- LocalStorage-basiertes State-Management
- Keine DB-Migration nötig
- PWA-konform (offline-fähig)
- **Commit:** `feat: add tutorial context with localStorage persistence`

**B. TutorialOverlay Component (2.5h)**
```tsx
// src/components/tutorial/TutorialOverlay.tsx
interface TutorialOverlayProps {
  page: string;
  step: string;
  targetSelector: string; // CSS Selector für Spotlight
  position: 'top' | 'bottom' | 'left' | 'right';
  content: {
    title: string;
    description: string;
    tip?: string; // Optional
  };
  zIndex?: number;
}
```

**Features:**
- Halbtransparenter Backdrop (`backdrop-filter: blur(2px)`)
- Spotlight-Effekt mit CSS box-shadow
- Pulsier-Animation (2s Intervall, scale 1.0 → 1.05)
- Info-Card mit Glassmorphismus
- Pfeil zeigt auf Element
- 2 Buttons:
  - "Verstanden" (primär)
  - Dropdown-Menu (⋮):
    - "Auf dieser Seite nicht mehr"
    - "Überall nicht mehr"
- Scroll-to-Element mit `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- Fade-In/Out (150ms transition)
- **Commit:** `feat: implement tutorial overlay with spotlight and animations`

**C. TutorialBanner Component (1h)**
```tsx
// src/components/tutorial/TutorialBanner.tsx
interface TutorialBannerProps {
  page: string;
  step: string;
  content: string; // Kurzer Tipp-Text
  icon?: string; // Lucide Icon Name, default: 'Lightbulb'
  dismissable?: boolean;
}
```

**Features:**
- Glassmorphismus-Style (konsistent mit App)
- Icon (💡 Glühbirne default) + Text
- X-Button rechts
- Checkbox "Nicht mehr zeigen" inline
- Fade-In Animation
- Positionierung: Top der Page (unter Header)
- **Commit:** `feat: add tutorial banner component`

**D. Tutorial-Inhalte definieren (1.5h)**
```typescript
// src/data/tutorialSteps.ts
export const TUTORIAL_STEPS = {
  home: [
    {
      step: 'select-template',
      type: 'spotlight',
      targetSelector: '.template-card:first-child',
      position: 'bottom',
      content: {
        title: 'Wähle deine Vorlage',
        description: 'Tippe auf eine Vorlage, um dein Tagebuch zu starten.',
      }
    },
    {
      step: 'create-template',
      type: 'banner',
      content: '💡 Tipp: Neue Vorlage erstellen mit dem +-Button unten'
    }
  ],
  diary: [
    {
      step: 'first-entry',
      type: 'spotlight',
      targetSelector: '.diary-container',
      position: 'top',
      content: {
        title: 'Trage deine Daten ein',
        description: 'Fülle die Felder aus und speichere deinen Eintrag.',
        tip: 'Alle Felder sind optional.'
      }
    },
    {
      step: 'pull-to-reveal',
      type: 'banner',
      content: '💡 Tipp: Ziehe nach unten für Vorlagen-Anpassungen'
    },
    {
      step: 'save-reminder',
      type: 'banner',
      content: '💡 Vergiss nicht zu speichern! (💾 Button oben rechts)'
    }
  ],
  editor: [
    // ... weitere 4 Steps
  ],
  dashboard: [
    // ... 2 Steps
  ],
  history: [
    // ... 1 Step
  ],
  settings: [
    // ... 1 Step (Backup-Hinweis)
  ]
};
```
- **Total:** 13 Tutorial-Steps über 6 Pages
- **Commit:** `feat: define tutorial content for all pages`

**E. Settings Integration (30 Min)**
```tsx
// src/pages/SettingsView.tsx
<Card>
  <CardHeader>
    <CardTitle>Tutorial-Hilfe</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-muted-foreground mb-4">
      Zeigt alle Hilfe-Tipps wieder an und startet den
      interaktiven Guide von vorne.
    </p>
    <Button 
      onClick={handleResetTutorial}
      variant="outline"
      className="w-full"
    >
      <RotateCcw className="mr-2 h-4 w-4" />
      Tutorial neu starten
    </Button>
  </CardContent>
</Card>
```
- Button ruft `tutorialContext.resetTutorials()` auf
- Löscht alle LocalStorage-Flags
- Zeigt Toast: "Tutorial wurde zurückgesetzt"
- **Commit:** `feat: add tutorial reset button to settings`

**F. DiaryView Integration (30 Min)**
```tsx
// src/pages/DiaryView.tsx
const { showTutorial, markStepCompleted } = useTutorial();
const [hasShownTutorial, setHasShownTutorial] = useState(false);

useEffect(() => {
  // Tutorial nur beim ersten Besuch nach Setup
  const isFirstVisit = !localStorage.getItem('tutorial-diary-visited');
  
  if (isFirstVisit && !hasShownTutorial) {
    setHasShownTutorial(true);
    localStorage.setItem('tutorial-diary-visited', 'true');
    // Tutorial-Sequenz wird automatisch angezeigt
  }
}, []);

return (
  <div>
    {/* Tutorial-Overlays & Banner werden hier gerendert */}
    <TutorialOverlay
      page="diary"
      step="first-entry"
      targetSelector=".diary-container"
      // ... props
    />
    <TutorialBanner
      page="diary"
      step="pull-to-reveal"
      content="💡 Tipp: Ziehe nach unten für Vorlagen-Anpassungen"
    />
    {/* ... Rest der DiaryView */}
  </div>
);
```
- Tutorial startet automatisch nach SetupWizard
- Flag verhindert erneutes Anzeigen
- **Commit:** `feat: integrate tutorial into diaryview with auto-start`

**G. Weitere Pages Integration (1h)**
- HomePage: 2 Steps (Spotlight + Banner)
- EditorMode: 4 Steps (Spotlight + Banner)
- Dashboard: 2 Steps
- HistoryView: 1 Step
- SettingsView: 1 Step
- **Commit:** `feat: integrate tutorial steps into all pages`

---

#### 🎨 UI/UX Spezifikationen:

**Spotlight-Overlay:**
- Backdrop: `rgba(0, 0, 0, 0.6)` + `backdrop-filter: blur(2px)`
- Spotlight: Target-Element bleibt sichtbar (keine Verdunkelung)
- Pulsier-Animation: `@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }`
- Info-Card: Glassmorphismus (wie DiaryView Cards)
- Pfeil: CSS `::before` mit border-triangle
- Z-Index: 9999 (über allem)

**Banner:**
- Position: `position: sticky; top: 56px;` (unter Header)
- Glassmorphismus: `background: rgba(255,255,255,0.85); backdrop-filter: blur(10px);`
- Border: `1px solid rgba(255,255,255,0.3)`
- Shadow: `box-shadow: 0 2px 8px rgba(0,0,0,0.1)`
- Padding: `p-3` (12px)
- Icon-Größe: 20px (Lucide)
- Text: `text-sm`

**Animationen:**
- Fade-In: `transition: opacity 150ms ease-in`
- Fade-Out: `transition: opacity 150ms ease-out`
- Spotlight-Pulse: `animation: pulse 2s ease-in-out infinite`
- Scroll-to-Element: `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`

---

#### ✅ Testing-Checkliste:

- [ ] Tutorial startet nach SetupWizard in DiaryView
- [ ] Spotlight-Overlays zeigen korrekt auf Elemente
- [ ] Pulsier-Animation läuft smooth
- [ ] Scroll-to-Element funktioniert
- [ ] "Auf dieser Seite nicht mehr" funktioniert
- [ ] "Überall nicht mehr" funktioniert
- [ ] Settings "Tutorial neu starten" reaktiviert alles
- [ ] LocalStorage persistence über Sessions
- [ ] Mobile: Touch-Targets 44px
- [ ] Mobile: Animationen performant
- [ ] Tutorial-Sequenz logisch für neue User

---

#### 🐛 Edge Cases:

**1. Element nicht gefunden:**
- Fallback: Tutorial-Card zentriert ohne Spotlight
- Console-Warning für Entwickler

**2. Tutorial während Navigation:**
- Tutorial pausiert bei Page-Wechsel
- Fortsetzung auf neuer Page wenn aktiviert

**3. Mehrere Overlays gleichzeitig:**
- Nur 1 Overlay + max. 1 Banner gleichzeitig
- Queue-System für Sequenzen

**4. User schließt App während Tutorial:**
- State bleibt in LocalStorage
- Fortsetzung beim nächsten Besuch

---

#### 📦 Aufwands-Breakdown:

| Task | Aufwand |
|------|--------|
| TutorialProvider Context | 1h |
| TutorialOverlay Component | 2.5h |
| TutorialBanner Component | 1h |
| Tutorial-Inhalte definieren | 1.5h |
| Settings Integration | 30 Min |
| DiaryView Integration | 30 Min |
| Weitere Pages Integration | 1h |
| **GESAMT** | **8h** |

**Falls nötig:** Iterative Nachbesserung (+1-2h)

---

## 🔮 PHASE 12: FUTURE FEATURES (VERSION 2.0+)

**Priorität:** NIEDRIG - Für spätere Versionen

### 12.1: BodyMap Heatmap-Visualisierung (4-6h)
**Branch:** `feature/bodymap-heatmap`
**Priorität:** NIEDRIG (v2.0+)

**Ziel:** Alle gespeicherten Schmerzpunkte als Heatmap anzeigen für Musteranalyse

#### 📋 Konzept:

**Was ist eine Heatmap?**
- Alle Schmerzpunkte aus allen Einträgen eines Zeitraums überlagert
- Häufig markierte Bereiche: Rot/Orange (Hotspots)
- Selten markierte Bereiche: Gelb/Grün
- Nie markierte Bereiche: Transparent/Blau

**Use Cases:**
- Schmerzmustertrekking über Wochen/Monate
- Visualisierung chronischer Schmerzpunkte
- Arztgespräche: "Wo tut es am häufigsten weh?"
- Korrelation mit Triggern/Medikamenten

#### 🎯 Implementierungs-Plan:

- [ ] **Daten-Aggregation (1.5h)**
  ```typescript
  interface HeatmapPoint {
    x: number;
    y: number;
    intensity: number; // Schmerzstärke (1-10)
    frequency: number; // Wie oft markiert
  }
  
  function aggregateBodyMapPoints(
    entries: Entry[], 
    templateId: number,
    timeRange: { start: Date, end: Date }
  ): HeatmapPoint[] {
    // Alle BodyMap-Blocks filtern
    // Punkte nach Koordinaten gruppieren
    // Intensität & Frequenz berechnen
  }
  ```
  - **Commit:** `feat: add bodymap heatmap data aggregation`

- [ ] **Heatmap Canvas Rendering (2h)**
  - Gradient-basierte Visualisierung
  - Farbschema: Blau (kalt) → Gelb → Orange → Rot (heiß)
  - Alpha-Blending für Überlagerungen
  - Smooth Transitions (Canvas 2D Gradient API)
  - **Commit:** `feat: implement heatmap canvas rendering`

- [ ] **UI Integration (1h)**
  - Toggle zwischen Normal-Ansicht und Heatmap
  - Zeitraum-Filter (7d, 1m, 3m, all)
  - Template-Auswahl (falls mehrere BodyMaps)
  - Legende (Farbskala + Erklärung)
  - **Commit:** `feat: integrate heatmap toggle in bodymap view`

- [ ] **Interaktive Hotspot-Details (1h)**
  - Hover über Hotspot: Tooltip mit Statistiken
    - Anzahl Markierungen
    - Durchschnittliche Schmerzstärke
    - Datum erstes/letztes Auftreten
  - Click → Liste aller Einträge mit diesem Punkt
  - **Commit:** `feat: add interactive hotspot tooltips to heatmap`

- [ ] **Export-Funktion (30 Min)**
  - Heatmap als PNG/PDF exportieren
  - Legende und Zeitraum inkludieren
  - Für Arztgespräche optimiert
  - **Commit:** `feat: add heatmap export functionality`

#### 💡 Technische Details:

**Canvas Gradient Rendering:**
```typescript
function renderHeatmap(canvas: HTMLCanvasElement, points: HeatmapPoint[]) {
  const ctx = canvas.getContext('2d');
  
  // Für jeden Punkt: Radialer Gradient zeichnen
  points.forEach(point => {
    const gradient = ctx.createRadialGradient(
      point.x, point.y, 0,
      point.x, point.y, point.frequency * 20 // Radius basierend auf Häufigkeit
    );
    
    // Farbverlauf: Transparent → Intensitätsfarbe
    gradient.addColorStop(0, `rgba(255, 0, 0, ${point.intensity / 10})`);
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });
}
```

**Farbschema (Intensität):**
- 1-3: Blau/Grün (niedrig)
- 4-6: Gelb/Orange (mittel)
- 7-10: Rot/Dunkelrot (hoch)

#### ❓ Offene Fragen (für v2.0):

1. **Heatmap-Modus:**
   - Separate View ODER Toggle in BodyMapBlock?
   - Dashboard-Integration?

2. **Daten-Granularität:**
   - Nur Koordinaten ODER auch Schmerzstärke berücksichtigen?
   - Gewichtung: Häufigkeit vs. Intensität?

3. **Performance:**
   - Wie viele Punkte maximal? (1000+?)
   - Caching-Strategie für große Datenmengen?

---

## 📊 AUFWANDS-SCHÄTZUNG

| Phase | Feature | Aufwand | Priorität |
|-------|---------|---------|-----------|
| 11.1 | Verlauf-Page | 3-4h | HOCH |
| 11.2 | Dashboard Export | 2-3h | HOCH |
| 11.3 | HomePage UI | 2-3h | HOCH |
| 11.4 | Datenpersistenz | 4-6h | KRITISCH |
| 11.5 | BodyMap Bildgrößen | 2-3h | MITTEL |
| 11.6 | Tutorial-Guide System | 6-8h | HOCH |
| **GESAMT Phase 11** | - | **~25h** | - |
| 12.1 | BodyMap Heatmap | 4-6h | NIEDRIG (v2.0) |

---

## 🎯 NÄCHSTE SCHRITTE (AKTUALISIERT)

**Neue Priorisierung (19.02.2026):**
1. ✅ **Phase 6.6:** Template-Switcher (KOMPLETT!) ✅
2. ✅ **Phase 11.3:** HomePage UI Überarbeitung (KOMPLETT!) ✅
3. 🟡 **Phase 11.6:** Tutorial-Guide System – DiaryView ✅ + EditorMode ✅ (in Arbeit)
4. 🔴 **Phase 11.4:** Datenpersistenz & Backup (NEXT - KRITISCH!)
5. 🟡 **Phase 11.2:** Dashboard Export
6. 🟡 **Phase 11.1:** Verlauf-Page Optimierung
7. 🟡 **Phase 11.5:** BodyMap Bildgrößen-Optimierung
8. 🟢 **Phase 8:** Code Cleanup
9. 🔮 **Phase 12.1:** BodyMap Heatmap (v2.0+)

**Rationale für neue Reihenfolge:**
- Template-Switcher = Quick Win (1.5h), verbessert Editor-UX sofort
- HomePage Responsive-Fix = Kritischer Bug, betrifft alle User
- Datenpersistenz = Verhindert Datenverlust (kritisch, aber aufwändiger)
- Export-Features = Wichtig für Arztgespräche
- Code Cleanup = Vor v1.0 Release durchführen

---

**Letzte Aktualisierung:** 19.02.2026  
**Aktueller Stand:** Phase 6 komplett ✅, Phase 11.3 komplett ✅, Phase 11.6 (Tutorial-System) in Arbeit  
**Nächster Schritt:** Phase 11.4 - Datenpersistenz & Backup-System (KRITISCH!)  
**DB Version:** 14  
**Status:** Tutorial-System für DiaryView (5 Steps) + EditorMode (9 Steps) implementiert ✅, spotlightToggle-Feature für alternierende Spotlights ✅
