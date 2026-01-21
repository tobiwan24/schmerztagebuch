# 📋 Schmerztagebuch PWA

Eine sichere, verschlüsselte Progressive Web App zur Dokumentation von Schmerzen und Symptomen.

## 🌟 Features

### 🔐 Sicherheit & Datenschutz
- **AES-GCM 256-bit Verschlüsselung** für sensible Gesundheitsdaten
- **Drei Verschlüsselungsmodi**: Keine, Historie oder Volle Verschlüsselung
- **Biometrische Authentifizierung** (Fingerabdruck/Face ID) auf unterstützten Geräten
- **Lokale Datenspeicherung** - alle Daten bleiben auf dem Gerät (IndexedDB)
- **Session-Management** mit automatischem Timeout

### 📱 Progressive Web App
- **Offline-Funktionalität** - funktioniert ohne Internetverbindung
- **Installierbar** auf Smartphone und Desktop
- **Service Worker** für schnelle Ladezeiten und Caching
- **Responsive Design** - optimiert für Mobile und Desktop

### ✍️ Flexible Tagebuch-Vorlagen
- **Anpassbare Templates** für verschiedene Schmerzarten
- **Drag & Drop Editor** zum Erstellen eigener Vorlagen
- **8+ Block-Typen**:
  - Text & Textarea
  - Checkbox
  - Slider (Schmerzskala)
  - Datum & Zeit
  - Multi-Select
  - BodyMap (Körperkarte zur Schmerzlokalisation)
  - Foto-Upload

### 📊 Verlauf & Export
- **Filterbare Historie** nach Datum und Template
- **PDF-Export** mit medizinischem Layout
  - Automatische Einbindung von BodyMap-Bildern als Anhang
  - Zeitraum-Filter (Letzte 7 Tage, Monat, Jahr, etc.)
- **Detailansicht** aller Einträge

### 🗺️ BodyMap
- **Interaktive Körperkarte** zur visuellen Schmerzerfassung
- **Mehrere Schmerzpunkte** mit individueller Intensität
- **Farb-Codierung** nach Schmerzstärke (Grün → Gelb → Orange → Rot)
- **Preset-Verwaltung** für häufige Schmerzmuster

## 🚀 Technologie-Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Vanilla CSS (Custom Properties)
- **Datenbank**: IndexedDB
- **Verschlüsselung**: Web Crypto API (AES-GCM, PBKDF2)
- **PWA**: Service Worker + Web App Manifest
- **PDF-Generierung**: jsPDF
- **Build-Tool**: Vite
- **Deployment**: Vercel

## 📦 Installation & Entwicklung

### Voraussetzungen
- Node.js 18+ 
- npm oder yarn

### Setup

```bash
# Repository klonen
git clone https://github.com/tobiwan24/schmerztagebuch.git
cd schmerztagebuch

# Dependencies installieren
npm install

# Development Server starten
npm run dev

# Für HTTPS (wichtig für iOS/Biometrie):
npm run dev
# App läuft auf https://localhost:5173
```

### Build für Production

```bash
# Production Build erstellen
npm run build

# Preview des Builds
npm run preview
```

## 🔒 Verschlüsselung

Die App nutzt moderne Web-Standards für maximale Sicherheit:

- **AES-GCM 256-bit** Verschlüsselung
- **PBKDF2** Key-Derivation (100.000 Iterationen)
- **Zufällige Salts und IVs** für jeden Eintrag
- **Keine Plaintext-Speicherung** von Passwörtern

### Verschlüsselungsmodi

1. **Keine Verschlüsselung**: Daten werden unverschlüsselt gespeichert
2. **Historie verschlüsseln**: Nur gespeicherte Einträge werden verschlüsselt
3. **Volle Verschlüsselung**: Einträge + Templates werden verschlüsselt

## 🌐 PWA Installation

### Desktop (Chrome/Edge)
1. Öffne die App im Browser
2. Klicke auf das Install-Icon in der Adressleiste
3. Oder: Menü → "App installieren"

### iOS (Safari)
1. Öffne die App in Safari
2. Tippe auf Share-Button
3. "Zum Home-Bildschirm"
4. App vom Home-Screen öffnen für volle PWA-Funktionalität

### Android (Chrome)
1. Öffne die App in Chrome
2. Menü → "Zum Startbildschirm hinzufügen"

## 🛠️ Entwicklung

### Projekt-Struktur

```
src/
├── components/          # React Komponenten
│   ├── blocks/         # Block-Typen für Tagebuch
│   ├── AuthModal.tsx   # Authentifizierung
│   ├── Header.tsx      # App-Header
│   └── ...
├── pages/              # Haupt-Views
│   ├── DiaryView.tsx   # Tagebuch-Hauptseite
│   ├── EditorMode.tsx  # Template-Editor
│   ├── HistoryView.tsx # Verlauf
│   ├── SettingsView.tsx # Einstellungen
│   └── SetupWizard.tsx # Onboarding
├── utils/              # Utilities
│   ├── auth.ts         # Authentifizierung & Session
│   ├── crypto.ts       # Verschlüsselung
│   ├── pdfExport.ts    # PDF-Generierung
│   └── ...
├── types/              # TypeScript Typen
├── styles/             # CSS Dateien
└── db.ts               # IndexedDB Wrapper

public/
├── sw.js               # Service Worker
├── manifest.json       # PWA Manifest
└── icons/              # App Icons
```

### Wichtige Scripts

```bash
npm run dev          # Development Server
npm run build        # Production Build
npm run preview      # Preview Production Build
npm run lint         # ESLint Check
```

## 🔐 Sicherheits-Hinweise

- **HTTPS erforderlich**: Verschlüsselung und Biometrie funktionieren nur über HTTPS
- **Keine Cloud-Sync**: Alle Daten bleiben lokal auf dem Gerät
- **Passwort-Recovery**: Es gibt KEINE Passwort-Wiederherstellung - bei Verlust sind verschlüsselte Daten unwiederbringlich!
- **Backup-Empfehlung**: Nutze den PDF-Export für regelmäßige Backups

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) Datei

## 🤝 Contributing

Contributions sind willkommen! Bitte:
1. Fork das Repository
2. Erstelle einen Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit deine Änderungen (`git commit -m 'Add AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

## 📞 Support

Bei Fragen oder Problemen öffne bitte ein [Issue](https://github.com/tobiwan24/schmerztagebuch/issues).

## 🙏 Danksagungen

- Icons: SVG Emoji
- PDF-Generation: jsPDF
- Verschlüsselung: Web Crypto API

---

**Entwickelt mit ❤️ für sichere Gesundheitsdokumentation**
