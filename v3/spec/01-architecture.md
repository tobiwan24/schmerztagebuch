# 01 — Architektur, Stack, Monorepo

## Stack

| Schicht | Technologie |
|---|---|
| Sprache | TypeScript (strict, `noUncheckedIndexedAccess`), ESM |
| Paketverwaltung | npm workspaces (Root `v3/package.json`) |
| Web | React + Vite, Tailwind CSS, **shadcn/ui** (einziges UI-Kit), Recharts über shadcn Charts |
| Lokale DB | Dexie (IndexedDB), Datenbankname `stb-v3` (kollidiert nicht mit v2 `PainDiaryDB`) |
| Suche | MiniSearch im Web Worker |
| Validierung | zod (eine Quelle für Typen, Laufzeitvalidierung, OpenAPI) |
| Krypto | WebCrypto (`crypto.subtle`), keine eigenen Primitive |
| WebAuthn | `@simplewebauthn/browser` / `@simplewebauthn/server` |
| Server | Fastify, better-sqlite3, zod-Typprovider, OpenAPI-Generierung |
| LLM | *(v3.x)* Provider-Abstraktion: Ollama (HTTP) + Anthropic (`@anthropic-ai/sdk`) |
| MCP | *(v3.x)* `@modelcontextprotocol/sdk` (stdio) |
| Tests | Vitest, `fake-indexeddb`, Playwright (Chromium + WebKit), `fastify.inject` |
| Deployment | Docker (Web statisch + Server), wie v2 im Homelab |

## Monorepo-Struktur

```
v3/
  package.json            # workspaces + Skripte (verify, test, acceptance, …)
  tsconfig.base.json
  packages/
    core/                 # Domäne: IDs, zod-Schemas, Typen, Blockwerte, Vorlagenversionen, HLC, Fractional Index
    crypto/               # Schlüsselhierarchie, Envelope-Formate, Wrap/Unwrap, Share-Keys (nur WebCrypto)
    sync-protocol/        # DTOs + zod-Schemas für Client↔Server, Konfliktregeln (pure Funktionen)
    analysis/             # Suche-Filter-DSL, Aggregation, Statistik, Analysefunktionen (pure, ohne DOM)
    export/               # Exportformate (JSON v1, CSV long/wide, PDF), Import/Validierung
    llm/                  # (v3.x) Provider-Interface, OllamaProvider, AnthropicProvider, FakeProvider, Prompt-Bausteine
    client-sdk/           # (v3.x) Node/Browser-Client: Auth, Sync-Pull, Entschlüsselung (für Integrationen, MCP)
  apps/
    web/                  # PWA (React), Dexie-Repositories, Sync-Engine, Worker, UI
    server/               # Fastify-API: Auth, Geräte, Tagebücher, Mitglieder/Einladungen, Records, Blobs, Intake
    mcp/                  # (v3.x) lokaler MCP-Server auf Basis von client-sdk
  e2e/                    # Playwright-Tests (Web + Server)
  fixtures/               # Testdaten: synthetische Tagebücher, v2-DB-Dumps, Analyse-Fixtures mit bekannten Ergebnissen
  spec/  scripts/  reports/
```

In v3.0 werden die mit *(v3.x)* markierten Pakete/Apps **nicht angelegt**.

## Abhängigkeitsregeln (per ESLint `import/no-restricted-paths` erzwungen)

- `core` hängt von nichts Internem ab.
- `crypto`, `sync-protocol`, `analysis`, `export`, `llm` dürfen nur `core` importieren (`export` zusätzlich `analysis`).
- `apps/*` dürfen alle `packages/*` importieren, aber nie einander.
- `packages/*` importieren nie React, Dexie, Fastify oder DOM-APIs (Ausnahme: `crypto` nutzt `globalThis.crypto`).
- In `apps/web`: Komponenten greifen **nie** direkt auf Dexie zu, nur über `apps/web/src/data/repositories/*`.
- Kein Modul außer `apps/web/src/data/crypto-session.ts` hält entschlüsselte Schlüssel.
- Nur `apps/web/src/data/repositories/*`, `apps/web/src/data/codec/*` und die Sync-Engine lesen/schreiben `records.payload`.

## Skripte (Root `v3/package.json`)

| Skript | Inhalt |
|---|---|
| `npm run typecheck` | `tsc -b` über alle Workspaces |
| `npm run lint` | ESLint (inkl. Abhängigkeitsregeln) |
| `npm run test` | Vitest (alle Workspaces), schreibt `reports/vitest.json` |
| `npm run test:e2e` | Playwright, schreibt `reports/playwright.json` |
| `npm run build` | Build aller Apps |
| `npm run verify` | typecheck + lint + test + build (muss vor jedem Commit grün sein) |
| `npm run acceptance [-- --milestone Mx]` | `node scripts/check-acceptance.mjs` |
| `npm run dev` | Web + Server parallel |

## Konfiguration

- Server-Konfiguration ausschließlich über Umgebungsvariablen, validiert mit zod beim Start
  (`RP_ID`, `ALLOWED_ORIGINS`, `DATABASE_PATH`, `BLOB_DIR`; erst v3.x: `OLLAMA_URL`, `OLLAMA_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`).
- Keine Secrets im Repo; `.env.example` dokumentiert alle Variablen.

## Deployment und Ablösung von v2

- v3 läuft unter **derselben Adresse** wie v2 (gleicher Origin → v3 kann `PainDiaryDB` direkt lesen, siehe 11).
- Bis zur Ablösung wird v3 lokal bzw. unter einer Vorschau-Adresse getestet; der Root-Build bleibt v2.
- Ablösung (Meilenstein M13, Human-Gate): Build-Ziel des Web-Deployments wird auf `v3/apps/web` umgestellt; der
  v3-Service-Worker (gleicher Scope `/`) ersetzt den v2-Service-Worker. Der v3-Server läuft als **neuer** Container
  neben dem v2-Server; der v2-Server bleibt bis zum Abschluss der Migration erreichbar (11) und wird danach abgeschaltet.
- Gleicher Origin heißt gleiche WebAuthn-`RP_ID`: v3 legt **neue** Passkeys an (Anzeigename „Schmerztagebuch v3"),
  v2-Passkeys werden nur noch für die Migration verwendet.

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| ARC-01 | `npm run verify` läuft im frischen Checkout nach `npm ci` ohne Fehler durch. | integration |
| ARC-02 | Ein Import von `react` oder `dexie` in einem `packages/*`-Modul lässt `npm run lint` fehlschlagen (Regeltest mit Fixture-Datei). | unit |
| ARC-03 | Ein direkter Dexie-Zugriff aus `apps/web/src/components/**` lässt `npm run lint` fehlschlagen. | unit |
| ARC-04 | Server startet nicht und meldet die fehlende Variable, wenn `RP_ID` fehlt; startet mit gültiger `.env.example`-Konfiguration. | integration |
| ARC-05 | `check-acceptance.mjs` meldet eine Spec-ID ohne Test als fehlend und eine mit bestandenem Test als erfüllt (Selbsttest mit Fixture-Reports). | unit |
| ARC-06 | TypeScript läuft mit `strict` und `noUncheckedIndexedAccess`; es gibt kein `any` in `packages/*` (Lint-Regel `no-explicit-any` = error). | unit |
