# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
Dexie (IndexedDB wrapper) with database name `PainDiaryDB` at schema **version 14**. Three tables:
- `templates` — reusable diary templates with ordered blocks
- `entries` — filled-in template submissions (data stored as JSON string, optionally encrypted)
- `settings` — key/value pairs for app configuration

When adding a schema change, increment the version number. Auto-migration logic lives in `db.ts` (e.g. `migrateTemplateStyles`, `migrateImageBlocksToTextArea`).

### Block System
All diary content is composed of **blocks** (`src/types/blocks.ts`). The `BlockType` union is: `text | checkbox | image | slider | date | multiselect | textarea | bodymap`. `image` blocks are legacy and are transparently auto-migrated to `textarea` blocks on read.

`BlockRenderer.tsx` is the central dispatcher — it receives a `Block` and routes to the appropriate component in `src/components/blocks/`. To add a new block type, add it to `BlockType`, create a component in `blocks/`, add a case to `BlockRenderer`, and add it to `BlockPalette`.

### Encryption (`src/utils/crypto.ts` + `src/utils/auth.ts`)
Three encryption modes stored in settings: `none | history | full`.
- Password is never stored in plain text — a test string is encrypted and stored (`passwordTest` key), used for verification.
- Active session stores the password in `sessionStorage` with a 24-hour timeout.
- Encryption format: `Base64(salt[16] + iv[12] + ciphertext)` using AES-GCM 256-bit + PBKDF2 (100k iterations).
- Biometric auth uses WebAuthn (`navigator.credentials`) and only works on real HTTPS domains (not localhost/IP).

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
