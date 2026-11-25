# 12 — Qualität, Tests, Budgets, Betrieb

## Teststrategie

| Ebene | Werkzeug | Umfang |
|---|---|---|
| unit | Vitest | `packages/*` vollständig; pure Funktionen in `apps/*` |
| integration | Vitest + `fake-indexeddb`, `fastify.inject`, In-Memory-SQLite | Repositories, Sync-Engine gegen echten Server-Code, Migration |
| e2e | Playwright (Chromium + WebKit), virtueller WebAuthn-Authenticator mit PRF | Kernabläufe, zwei Browser-Kontexte für Sync/Teilen |
| manual | Checkliste in `PROGRESS.md` | echtes iPhone, echte Daten, Gates |

- Testnamen beginnen mit der Akzeptanz-ID: `it('SYN-04: disjunkte Blockänderungen werden gemergt', …)`.
  Mehrere IDs pro Test erlaubt (`'SYN-04 SYN-05: …'`).
- Reporter schreiben `reports/vitest.json` und `reports/playwright.json`; `scripts/check-acceptance.mjs` wertet sie aus.
- **Golden Files** unter `fixtures/golden/`; Aktualisierung nur bewusst mit `UPDATE_GOLDEN=1`.
- **Klartext-Marker:** Test-Fixtures enthalten eindeutige Marker (`STB-PLAINTEXT-MARKER-<n>`), nach denen
  Server-DB, Logs, Request-Bodies und Backups durchsucht werden.
- Zeit und Zufall sind in Tests injizierbar (`Clock`, `Random` in `core`), keine `Date.now()`-Aufrufe in `packages/*`.

## Abdeckung

- `packages/core`, `packages/crypto`, `packages/sync-protocol`: Zeilen-/Zweigabdeckung ≥ 90 %.
- `packages/analysis`, `packages/export`, `packages/llm`, `packages/client-sdk`: ≥ 85 %. `apps/*`: keine Quote, aber jede Akzeptanz-ID abgedeckt.

## Budgets

| Messgröße | Budget |
|---|---|
| Initiales JS (gzip) der Web-App | ≤ 250 KB; Diagramme, PDF, Migration, Editor per Lazy-Loading |
| Time to Interactive (Moto-G-Profil, Lighthouse) | ≤ 3,5 s |
| Lighthouse PWA/Best Practices/Accessibility | ≥ 90 |
| Eintrag speichern lokal | < 100 ms (BLK-08) |
| Server: Push von 100 Ops | < 300 ms (In-Memory-SQLite, CI) |

## Sicherheit

- CSP ohne `unsafe-inline`/`unsafe-eval`; `connect-src` nur eigener Server, Open-Meteo und (bis zum Abschluss der Migration) der v2-Server.
- Keine Drittanbieter-Skripte, keine Analytics, keine Fonts von Fremd-CDNs.
- `npm audit --omit=dev` ohne `high`/`critical` (CI-Schritt).
- Server: Helmet-Header, Rate-Limits (03, 08, 09), Request-Größenlimits, strukturierte Logs ohne Bodies.
- Abhängigkeiten werden vom Loop nur mit Eintrag in `DECISIONS.md` hinzugefügt (Name, Zweck, Lizenz, Alternative).

## Betrieb

- Docker-Images: `web` (statisch, nginx) und `server` (Node, SQLite-Volume, Blob-Volume). `docker compose` im Homelab-Repo.
- Server-Backup: täglicher SQLite-Snapshot (`VACUUM INTO`) + Blob-Verzeichnis; enthält nur Chiffretext.
- Health-Endpunkt `GET /api/v1/health` (Version, DB erreichbar), keine fachlichen Daten.
- Versionierung: eine Quelle `apps/web/src/version.ts` (`APP_VERSION`, beginnt mit `3.0.0-alpha.N`), der SW liest sie
  zur Build-Zeit (kein manueller Abgleich wie in v2).

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| QA-01 | Abdeckungsgrenzen aus „Abdeckung" werden in CI erzwungen (Vitest `thresholds`). | integration |
| QA-02 | Initiales JS ≤ 250 KB gzip (Build-Analyse-Skript schlägt sonst fehl). | integration |
| QA-03 | Lighthouse-CI erreicht ≥ 90 in PWA, Best Practices und Accessibility. | e2e |
| QA-04 | CSP-Header sind gesetzt; ein eingeschleustes Inline-Skript wird blockiert (E2E prüft Konsolen-CSP-Verletzung). | e2e |
| QA-05 | `npm audit --omit=dev` meldet keine `high`/`critical`-Lücken. | integration |
| QA-06 | Kein `Date.now()`/`Math.random()` in `packages/*` (Lint-Regel). | unit |
| QA-07 | Server-Logs eines vollständigen E2E-Laufs enthalten keine Klartext-Marker und keine Request-Bodies. | e2e |
| QA-08 | `docker compose up` startet Web und Server; Health-Endpunkt antwortet mit Version. | integration |
| QA-09 | Server-Backup-Skript erzeugt einen konsistenten Snapshot, der sich in einen frischen Server einspielen lässt. | integration |
| QA-10 | SW und App melden dieselbe Version aus `version.ts` (Build-Test). | unit |
| QA-11 | Jede Abhängigkeit in `package.json`-Dateien hat einen Eintrag in `DECISIONS.md` (Skript-Prüfung). | unit |
