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

Monorepo mit npm-Workspaces in der Repo-Wurzel (v3; v2 ist seit 2026-11-25 entfernt, RDM-036).

```bash
npm ci                 # Abhängigkeiten
npm run verify         # Typecheck, Lint (inkl. UI-33 shadcn-only), Unit-/Integrationstests, Build, Bundle-Budget
npm run test:e2e       # Playwright (Chromium + WebKit)
npm run acceptance     # Akzeptanz-IDs aus spec/*.md gegen die Testreports (-- --milestone Mx)
npm run verify:docker  # Docker-Build + Health (braucht laufendes Docker)
```

> Web Crypto und WebAuthn brauchen HTTPS oder `localhost`.

## Architecture

Die Wahrheit steht in den Specs und Projektdateien, nicht hier:

| Datei | Inhalt |
|---|---|
| `README.md` | Einstieg, Definition of Done |
| `spec/00-overview.md` … `spec/12-*.md` | Zielspezifikationen je Bereich mit Akzeptanz-IDs (`spec/01-architecture.md`: Struktur, Abhängigkeitsregeln) |
| `LOOP.md` | Arbeitsregeln (Test zuerst, Akzeptanz-IDs, Commits) |
| `DECISIONS.md` | Entscheidungslog (A-NNN), UI-Ausnahmen nur mit „Freigabe User“ |
| `PROGRESS.md`, `MILESTONES.md` | Stand, Meilensteine, manuelle Kriterien |
| `DEPLOYMENT.md` | Betrieb auf VM 100 (`~/docker/schmerztagebuch-v3`, Branch `main`) |

Kurzüberblick: `apps/web` (React-PWA, Dexie-Repositories, Sync, shadcn/ui), `apps/server` (Fastify, SQLite, Blobs),
`apps/mcp`, `packages/{core,crypto,sync-protocol,analysis,export,llm,client-sdk}`.

### Versionierung

Mit jedem Release: `apps/web/src/version.ts` erhöhen und Eintrag in `apps/web/src/data/changelog.ts`.

### Branches

Feature-Branch von `main` → PR direkt nach `main` (seit 2026-11-25). `main` ist Produktion (VM deployt `main`).
