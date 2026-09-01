# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Always Read, Never Guess

Before suggesting or making any change, read the affected file. Never assume what a file contains, how a function behaves, or what a component imports. Use `Grep` or `Glob` when uncertain. Reference code with `file.tsx:line` format.

## Context Recovery

After context compression or at the start of a new session, run this routine:

```bash
git log --oneline -10   # What was done recently?
git status              # Any open changes?
```

Then read:
1. `_planning/PRD.md` — project status overview
2. The relevant feature file in `_planning/features/` for the current task

## Rules

Full behavior conventions are in `.claude/rules/conventions.md`. Key points:
- Use `EnterPlanMode` when >2 files are affected, for new features, or architectural decisions
- Keep answers short — code speaks for itself
- Never invent functions/variables; use `Grep`/`Glob` to verify

## _planning/ Conventions

### File Structure

| Path | Type | Format |
|---|---|---|
| `_planning/PRD.md` | Project overview | Prose + status tables |
| `_planning/roadmap.md` | Roadmap overview | Prose + link table to RDM files |
| `_planning/roadmap/RDM-NNN.md` | Individual roadmap item | Frontmatter + description |
| `_planning/issues.md` | Issues index | Frontmatter + link table |
| `_planning/issues/ISS-NNN.md` | Individual issue | Frontmatter + description |
| `_planning/features/FEAT-NNN.md` | Feature detail | Frontmatter + prose |
| `_planning/Notizen_obsidian/inbox.md` | Raw unstructured ideas | Plain text, processed on demand |

### ID Prefixes & Required Frontmatter Fields

| Prefix | Type | Required fields |
|---|---|---|
| `ISS-NNN` | Issue | `id`, `title`, `type: issue`, `area`, `priority`, `status`, `created` |
| `FEAT-NNN` | Feature | `id`, `title`, `type: feature`, `area`, `status`, `priority`, `created`, `updated` |
| `RDM-NNN` | Roadmap entry | `id`, `title`, `type: roadmap`, `area`, `status`, `priority`, `branch`, `refs`, `created`, `updated` (individual file in `_planning/roadmap/`) |

Valid `area` values: `dashboard`, `ui`, `pwa`, `encryption`, `export`, `templates`
Valid `status` values (issue): `open`, `in-progress`, `resolved`
Valid `status` values (feature): `planned`, `in-progress`, `done`
Valid `priority` values: `low`, `medium`, `high`

### Behavior Rules

- **Issues:** When an issue is resolved, delete the `ISS-NNN.md` file and remove its row from `issues.md` index.
- **Features:** When starting work on a feature, update `status` and `updated` in its frontmatter.
- **Roadmap RDM entries:** Individual files in `_planning/roadmap/RDM-NNN.md`. When done: set `status: done`, move to `_planning/archive/roadmap/`, update table in `roadmap.md`.
- **New roadmap items:** Create `RDM-NNN.md` in `_planning/roadmap/` and add a row to `roadmap.md`.
- **New issues:** Create `ISS-NNN.md` in `_planning/issues/` and add a row to `issues.md` index. Use next sequential ID.
- **Inbox processing:** When asked to process `_planning/Notizen_obsidian/inbox.md`, create Issues/Features/RDM entries from the content, then archive to `_planning/archive/inbox-YYYY-MM-DD.md` and clear inbox.
- **Cross-references:** Use IDs (`ISS-001`, `FEAT-003`) — never file paths — when referencing across documents.

### Local Git Versioning

`_planning/` is a fully independent local git repository — no remote, never pushed to GitHub.
It contains planning documents only and is completely separate from the main repo.

**Two-task rule after plan mode:** When a plan has been agreed on, always perform two separate tasks:
1. Write plan changes to `_planning/` and commit there:
   ```bash
   cd _planning && git add -A && git commit -m "docs: ..."
   ```
2. Implement the plan in the main repo, commit and push:
   ```bash
   git add <files> && git commit -m "..." && git push
   ```

---

## Commands

```bash
npm run dev        # Start dev server (http://localhost:5173)
npm run build      # TypeScript compile + Vite production build
npm run preview    # Preview production build
npm run lint       # ESLint check
```

There is no test framework configured in this project.

> **Note:** Web Crypto API (`crypto.subtle`) requires HTTPS or localhost. Encryption/biometrics only work on `localhost` or a proper HTTPS deployment.

## Architecture

### Navigation
The app uses **manual view-state routing** — no React Router. `App.tsx` holds a `currentView` state that switches between: `setup | home | diary | editor | history | settings | dashboard`. Navigation is done by calling `setCurrentView` through handler functions passed as props.

### Database (`src/db.ts`)
Dexie (IndexedDB wrapper) with database name `PainDiaryDB` at schema **version 21**. Three tables:
- `templates` — reusable diary templates with ordered blocks
- `entries` — filled-in template submissions (data stored as JSON string, optionally encrypted)
- `settings` — key/value pairs for app configuration

`entries` also carries sync-related fields (`syncId`, `updatedAt`, `deleted` soft-delete, `encryptionSource: 'cloud' | 'local'`) added for Cloud-Sync (see below).

When adding a schema change, increment the version number. Auto-migration logic lives in `db.ts` (e.g. `migrateTemplateStyles`, `migrateImageBlocksToTextArea`). DB writes go exclusively through `db.ts` functions (`createEntry`/`updateEntry`/…) — never call `db.entries.*`/`db.templates.*` directly from components or utils.

### Block System
All diary content is composed of **blocks** (`src/types/blocks.ts`). The `BlockType` union is: `text | checkbox | image | slider | date | multiselect | textarea | bodymap`. `image` blocks are legacy and are transparently auto-migrated to `textarea` blocks on read.

`BlockRenderer.tsx` is the central dispatcher — it receives a `Block` and routes to the appropriate component in `src/components/blocks/`. To add a new block type, add it to `BlockType`, create a component in `blocks/`, add a case to `BlockRenderer`, and add it to `BlockPalette`.

### Encryption (`src/utils/crypto.ts` + `src/utils/auth.ts`)
Three encryption modes stored in settings: `none | history | full`.
- Password is never stored in plain text — a test string is encrypted and stored (`passwordTest` key), used for verification.
- Active session stores the password in `sessionStorage` with a 24-hour timeout.
- Encryption format: `Base64(salt[16] + iv[12] + ciphertext)` using AES-GCM 256-bit + PBKDF2 (100k iterations).
- Biometric auth uses WebAuthn (`navigator.credentials`) and only works on real HTTPS domains (not localhost/IP).

### Cloud-Sync (optional, `src/services/syncService.ts` + `server/`)
Optional E2E-encrypted multi-device sync against a self-hosted backend (`server/`, Fastify + better-sqlite3, deployed separately via Docker — see Homelab repo). Client-side:
- Login via WebAuthn Passkey (PRF extension) derives a Data-Encryption-Key (DEK) client-side; the server never sees plaintext. `src/utils/keyManagement.ts` handles HKDF/AES-KW envelope encryption, `src/utils/entryEncryption.ts` exposes `getCloudEncryptionKey()`.
- Decryption call sites must check the Cloud-DEK first (see `src/hooks/useDecrypt.ts` for the canonical priority order: Cloud-DEK → local session password), since Passkey-only users never have a local session password set.
- `runSync()` (push-then-pull, LWW conflict resolution) is triggered explicitly right after a successful entry/template save (`DiaryView.tsx`, `HistoryView.tsx`, `EditorMode.tsx`) plus `visibilitychange`/`online` events and app start (`NavigationContext.tsx`) as a safety net — there are no generic Dexie write-hooks anymore (removed to avoid self-retriggering on pull-applied writes).
- A mandatory backup code (recoverable KEK) is the recovery path if the Passkey device is lost.

### Styling
Hybrid approach:
- **shadcn/ui components** (`src/components/ui/`) use Tailwind CSS with CSS variables defined in `src/index.css`.
- **Custom styles** are imported in `main.tsx`: `global.css`, `layout.css`, `components.css`, `tutorial.css`, `blocks.css`, `setup.css`.
- Path alias `@/` resolves to `src/` (configured in `vite.config.ts`).

### Key Files
| File | Purpose |
|---|---|
| `src/App.tsx` | Root component, view routing, auth gate, template loading |
| `src/db.ts` | Dexie DB instance + all CRUD functions + migration logic |
| `src/types/blocks.ts` | All block type definitions and type guards |
| `src/types/database.ts` | `Template`, `Entry`, `Settings` interfaces |
| `src/utils/crypto.ts` | AES-GCM encrypt/decrypt |
| `src/utils/auth.ts` | Session management, password verification, WebAuthn biometrics |
| `src/utils/pdfExport.ts` | jsPDF-based PDF export with BodyMap image embedding |
| `src/data/templateCatalog.ts` | Pre-built template definitions shown in setup wizard |
| `src/contexts/TutorialContext.tsx` | Per-page tutorial state, persisted in `localStorage` |
| `public/sw.js` | Service worker for PWA offline caching |

### PWA
Service worker is manually registered in `main.tsx` (not via vite-plugin-pwa). `public/sw.js` and `public/manifest.json` are the relevant files. The `vite-plugin-pwa` package is listed as a dependency but the actual SW registration is manual.
