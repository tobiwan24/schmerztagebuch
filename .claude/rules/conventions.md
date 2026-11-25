# Conventions

## Plan Mode

Use `EnterPlanMode` when ANY of the following apply:
- More than 2 files will be affected
- A new feature or component is being added
- Requirements are unclear or ambiguous
- An architectural decision is needed (routing, data model, encryption, etc.)
- The user's request could be interpreted in multiple ways

Skip plan mode for: single-line fixes, obvious typos, adding one small utility function with clear spec.

### shadcn-Abgleich (Pflicht in jedem Plan mit UI-Anteil)

- Der Plan enthält eine Tabelle **„shadcn-Abgleich“**: Bedarf → shadcn-Komponente (mit Doku auf ui.shadcn.com) → Status.
- Jede Zeile **ohne** shadcn-Original (eigener Nachbau, angepasste/abgespeckte shadcn-Komponente, Fremd-UI-Bibliothek, neues
  HTML-Element außerhalb `components/ui/`) ist eine **Ausnahme** und wird **vor `ExitPlanMode` per `AskUserQuestion`** zur
  Genehmigung gestellt. Ohne ausdrückliche Freigabe des Users wird sie nicht umgesetzt.
- Taucht eine Ausnahme erst beim Implementieren auf: anhalten und fragen, nicht selbst entscheiden.
- Freigaben stehen in `DECISIONS.md` (A-Eintrag mit „Freigabe User JJJJ-MM-TT“) und im Register `spec/ui-components.json`;
  Claude/Loop/Agenten tragen dort **nie** eine Freigabe ohne ausdrückliche Zustimmung des Users ein (geprüft von
  `npm run lint`, UI-33).

## Response Style

- Short and precise. No essay-length explanations.
- Code changes speak for themselves — no need to paraphrase what the diff already shows.
- When explaining, use bullet points, not paragraphs.
- Always reference code as `file.tsx:line` so the user can navigate directly.

## Scope Discipline — Keine ungebetenen Änderungen

**Gilt für alle Arbeiten: Issue-Fixes, neue Features, Refactoring.**

- Bestehende Funktionalitäten und UIs werden **niemals ohne explizite Anweisung** geändert oder entfernt, um ein Problem zu lösen.
- Jede Änderung muss direkt durch den Auftrag begründet sein. Kollateral-Änderungen ("während ich hier bin, räume ich das noch auf") sind verboten.
- Wenn eine Lösung eine bestehende Funktion berühren würde: **erst fragen**, dann handeln.
- Das gilt auch für UX-Entscheidungen: kein Umbauen von Layouts, Buttons, Flows, die nicht Gegenstand des Auftrags sind.

## Anti-Hallucination Rules

- Never invent function names, prop names, or variable names. Use `Grep` to verify they exist.
- Never assume a file's contents — always `Read` it first.
- Never claim a component accepts a prop without reading its type definition.
- When uncertain about any fact: `Grep`/`Glob` first, then answer.

## Projektstruktur und technische Regeln (v3)

Seit 2026-11-25 (RDM-036) liegt v3 in der Repo-Wurzel; der v2-Code ist entfernt. Struktur, Abhängigkeits- und
Krypto-Regeln stehen in `spec/01-architecture.md` und den übrigen Specs, Arbeitsregeln in `LOOP.md`, Entscheidungen in
`DECISIONS.md`. Lint (`npm run lint`) erzwingt u. a. Import-Grenzen, shadcn-only (UI-33) und kein `any`.

- UI: shadcn/ui-Komponenten aus `apps/web/src/components/ui/`, Tailwind mit `cn()`, Icons nur `lucide-react`.
- Datenzugriff im Web nur über Repositories (`apps/web/src/data/`), nie Dexie direkt aus Komponenten.
- Pure Logik in `packages/*`, Tests beginnen mit der Akzeptanz-ID.

## Branch Conventions

Neuer Branch wenn: neues Feature, Bugfix, Refactoring, oder mehr als 1-2 Dateien betroffen.
Kein neuer Branch bei: Tipp-Fehler, Doku-Änderungen, einzeiliger Fix auf aktuellem Branch.

**Naming:**
```
feat/kurze-beschreibung       # Neues Feature
fix/was-gefixt-wird           # Bugfix
refactor/was-umgebaut-wird    # Refactoring / Code-Cleanup
chore/was-erledigt-wird       # Config, Tooling, Deps
```

**Workflow:**
```bash
git checkout develop           # Von develop abzweigen (nie direkt auf main)
git pull                       # Aktuellen Stand holen
git checkout -b feat/xy        # Neuen Branch erstellen
```

Vor dem Branch-Erstellen immer prüfen ob bereits ein passender Branch existiert:
```bash
git branch -a | grep xy
```

**Release:** Feature-Branch → PR nach `develop` → PR `develop` → `main`. `main` ist der Produktionsstand, den die VM deployt
(seit 2026-11-25, RDM-036).

## Commit Conventions

Format: `<type>(<scope>): <short description>`

| Prefix | When to use |
|---|---|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring without behavior change |
| `docs:` | Documentation, CLAUDE.md, context files |
| `chore:` | Config, tooling, dependencies |
| `style:` | CSS/visual changes only |

Example: `feat(bodymap): add preset pain patterns`
