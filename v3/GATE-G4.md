# Gate G4 — Ablösung von v2

Material für die Freigabe UI-13 (Spec 10 „Human-Gates", Spec 11 „Ablösung", Spec 01 „Deployment und Ablösung von v2").
**Alle Schritte führt der User aus** — der Loop stellt nichts um, pusht nichts und fasst das Deployment nicht an.
Abhaken in [PROGRESS.md](PROGRESS.md) → „G4 — Ablösung" und „Ablösungs-Checkliste".

## Stand vor dem Gate (2026-11-17)

- Alle Meilensteine sind erledigt: M0–M14c (v2-Parität) und v3.x M15–M24. **Version 3.10.0-alpha.1.**
- `npm run verify` grün (779 Tests, Initiales JS 233,5 KB gzip, Budget 250 KB); voller E2E-Lauf (Chromium + WebKit) 297 bestanden / 0 fehlgeschlagen (42 übersprungen: Passkey-Tests in WebKit, Lighthouse u. a.).
- `npm run acceptance`: 261 automatisierte IDs erfüllt, 0 fehlgeschlagen. Offen:
  - **QA-08** (`docker compose up` startet Web + Server, Health antwortet) — wird ohne Docker übersprungen. Vor Schritt 4 einmal mit
    laufendem Docker Desktop: `npm run verify:docker` (der Server wurde seit der letzten grünen Prüfung weiter berührt: Schema 13, Integrationen).
- Manuell offen: CRY-17, MIG-16, VOI-11, SHR-12, UI-13 (Gate G4) sowie v3.x: EXP-25, VOI-17, ANA-31, SHR-16, DM-19 (nicht blockierend).
- Stellvertretend durch den Loop geprüft (ADR-012): G3 (UI-12, ANA-16, EXP-13) und der M14-Rundgang im iPhone-Viewport
  (390×844, Chromium + WebKit gegen die Produktions-Vorschau, `e2e/m14-walkthrough.spec.ts`) mit synthetischen Daten.

### Neue Funktionen seit dem Stand vom 2026-11-16 (M15–M24)

- **Neuigkeiten und Tutorial (M15):** Dialog „Neu in Version x“ nach einem Update, Liste unter Einstellungen → Über; geführte Tour je Seite (überspringen, erneut zeigen).
- **Medikamenten-Block (M16):** Medikamente mit Dosis, Einheit, Uhrzeit und Wirkung; Kreisdiagramm in der Auswertung; Katalog-Vorlage; Export (CSV, JSON, PDF).
- **Training (M17):** Trainingsvorlagen und Übungsblock, Durchgang Schritt für Schritt mit Timer, Funktionsphasen, eigene Erinnerung „Übungen“, Auswertung der Übungen.
- **Arzt-Link (M18):** befristeter, verschlüsselter Bericht per Link (Schlüssel nur im Link), Ansicht ohne Anmeldung, Liste und Widerruf.
- **KI-Funktionen (M19):** „Aus Text ausfüllen“, Rollenvorschlag im Editor, Zusammenfassung für den Arzt; Freigabe pro Vorgang, Standard aus, Anbieter Ollama oder Anthropic nur über den Server (`LLM_PROVIDER`, Standard `off`).
- **Zusammenhänge und Hinweise (M20):** Korrelationen mit Zeitversatz, mögliche Auslöser (immer mit Fallzahl), Schwellwert-Hinweise als Banner und lokale Benachrichtigung.
- **Dashboard-Baukasten (M21):** eigene Dashboards aus Widgets, Export als PNG und PDF-Layout „Dashboard“.
- **Teilen+ (M22):** Schlüsselrotation beim Entfernen eines Mitglieds oder Sperren eines Geräts (fortsetzbar), Recht „Vorlagen bearbeiten“, Hinweis auf neue Einträge anderer.
- **Lokale Verschlüsselung (M23):** Opt-in „Daten auf dem Gerät verschlüsseln“ (nicht wieder abschaltbar), verschlüsselter persistierter Suchindex.
- **Integrationen (M24):** Einstellungen → Integrationen (nur lesende Zugänge, Zugangsstring einmal sichtbar, Widerruf), Paket `client-sdk`, lokaler MCP-Server `apps/mcp` (README). Eine Schlüsselrotation widerruft Integrationen.
- Neue Serverteile seit M14b: Schlüsselrotation, Rechte, Arzt-Link (`shares`), KI-Routen, Integrationen; Schema-Version 13.
  Neue optionale Server-Variablen siehe `apps/server/.env.example` (u. a. `LLM_PROVIDER`, `LLM_DAILY_TOKENS`).

## Bekannte Lücken

- Keine funktionalen Lücken gegenüber v2 mehr bekannt (Vorlagen-Editor, Tags, Textarea-Anhänge, Wetter/GPS, Tagebuch-Einstellungen,
  Verlauf-Filter, PDF-Layouts, Auto-Sicherung, Sicherheit/Geräte/Sperre, Updates, Gefahr-Zone sind umgesetzt).
- **PDF-Fehler beim User:** nicht reproduziert. Heruntergeladene PDFs (alle drei Layouts, mit/ohne Passwort) öffnen in
  pdfjs; behoben wurden zwei mögliche Ursachen (nicht ladbares Bild brach den Export ab, Blob-URL zu früh freigegeben).
  **Bei der Abnahme mit den echten Daten prüfen** (Mehr → Export und Verlauf → Exportieren, alle Layouts).
- Nicht automatisierbar: Passkey/Face ID auf dem iPhone, Kurzbefehl, Einladung an zweites Gerät, Migration mit echten Daten.

## Checkliste (Spec 11)

### 1. Letzter v2-Sync auf jedem Gerät
- In v2 auf jedem Gerät die App öffnen, Sync abwarten (online, Vordergrund).

### 2. v2-Backup exportiert und extern gesichert
- In v2 auf dem Hauptgerät: Einstellungen → Manuelles Backup → Datei exportieren.
- Datei außerhalb des Geräts sichern (z. B. NAS). Sie dient auch als Migrationsquelle (MIG-12).

### 3. Migration in einer Vorschau-Umgebung mit Datenkopie
- v3 lokal oder unter einer Vorschau-Adresse starten (`npm run build && npm run preview` in `v3/`, oder `docker compose up`).
- Onboarding → `/migrate` → Quelle „v2-Backup-Datei" (Datei aus Schritt 2) → Trockenlauf → Migration → Prüfschritt.
- Erwartet: Bericht ohne Fehler; nicht entschlüsselbare Einträge stehen mit Datum im Bericht (MIG-13).
- Stichprobe: einige Einträge im Verlauf öffnen, Auswertung eines Monats und PDF ansehen.

### 4. v3-Server im Homelab inkl. Backup
- Images: `apps/server/Dockerfile` (Node, SQLite + Blobs unter `/data`) und `apps/web/Dockerfile` (nginx, leitet `/api/`
  an `server:3000` weiter). Vorlage: [docker-compose.yml](docker-compose.yml); Variablen: `apps/server/.env.example`.
- Pflichtvariablen Server: `RP_ID` (= Domain von v2, gleicher Origin), `ALLOWED_ORIGINS` (= `https://<Domain>`),
  `DATABASE_PATH`, `BLOB_DIR`. Volume für `/data` persistent anlegen.
- Build-Variable Web (optional): `VITE_V2_API_URL` = Adresse des **weiterlaufenden** v2-Servers, damit der
  Migrationsassistent Einträge per v2-Server-Pull ergänzen kann (MIG-11). Die CSP erlaubt diese Adresse dann automatisch.
- Prüfen: `curl https://<Domain>/api/v1/health` → `{ "version": …, "db": true }`.
- Backup täglich: `docker compose exec server node apps/server/dist/backup.js /data/backups/<Datum>` (Snapshot per
  `VACUUM INTO` + Blobs, nur Chiffretext; Ziel darf nicht existieren). Ergebnis extern sichern; Einspielen einmal testen.

### 5. Umstellung
- Web-Deployment-Build-Ziel von Repo-Root (v2) auf `v3/apps/web` umstellen — **gleiche Adresse** (sonst kann v3
  `PainDiaryDB` nicht lesen). Der v3-Service-Worker ersetzt den v2-SW (Scope `/`).
- v2-Server läuft weiter (neuer v3-Container daneben).
- Hauptgerät: App öffnen → neuen v3-Passkey anlegen → `/migrate` mit der lokalen `PainDiaryDB` → Prüfschritt grün →
  Stichprobe (**MIG-16**). „v2-Daten entfernen" erst danach.
- Weitere Geräte: in v3 anmelden, Daten kommen per Sync.
- Dabei die übrigen manuellen Kriterien abhaken:
  - **CRY-17** Passkey-Login auf dem iPhone (Face ID, iCloud-Schlüsselbund) inkl. App-Neustart.
  - **VOI-11** Mehr → Tagebücher → Kurzbefehl einrichten, auf dem iPhone ausführen, Eintrag erscheint.
  - **SHR-12** Mehr → Tagebücher → Mitglieder → Einladung an zweites iPhone, beide tragen ein.

### 6. v2-Server nach 30 Tagen abschalten
- Wenn 30 Tage lang keine Migration mehr nötig war.

## Rückweg
- Bis Schritt 6 bleibt v2 vollständig erhalten: Build-Ziel zurück auf den Repo-Root stellen. Die v2-`PainDiaryDB` wird von
  v3 nie verändert (MIG-02), solange „v2-Daten entfernen" nicht ausgelöst wurde.

## Freigabe
- **UI-13** abhaken = Freigabe zur Umstellung (Schritt 5).
