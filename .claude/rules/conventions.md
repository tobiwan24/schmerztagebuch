# Conventions

## Plan Mode

Use `EnterPlanMode` when ANY of the following apply:
- More than 2 files will be affected
- A new feature or component is being added
- Requirements are unclear or ambiguous
- An architectural decision is needed (routing, data model, encryption, etc.)
- The user's request could be interpreted in multiple ways

Skip plan mode for: single-line fixes, obvious typos, adding one small utility function with clear spec.

## Response Style

- Short and precise. No essay-length explanations.
- Code changes speak for themselves — no need to paraphrase what the diff already shows.
- When explaining, use bullet points, not paragraphs.
- Always reference code as `file.tsx:line` so the user can navigate directly.

## Anti-Hallucination Rules

- Never invent function names, prop names, or variable names. Use `Grep` to verify they exist.
- Never assume a file's contents — always `Read` it first.
- Never claim a component accepts a prop without reading its type definition.
- When uncertain about any fact: `Grep`/`Glob` first, then answer.

## File Structure Conventions

| Type | Location |
|---|---|
| Page-level views | `src/pages/` |
| Block components | `src/components/blocks/` |
| Shared UI | `src/components/ui/` (shadcn) |
| Utilities | `src/utils/` |
| TypeScript types | `src/types/` |
| Custom CSS | `src/styles/` (imported in `main.tsx`) |
| Static assets | `public/` |
| Pre-built templates | `src/data/templateCatalog.ts` |

## Styling Rules

- shadcn/ui components → Tailwind CSS with `cn()` utility
- Custom page/component styles → CSS classes in the appropriate `*.css` file (not inline styles)
- Never mix Tailwind utility classes into custom CSS files
- CSS variables for theming are defined in `src/index.css`

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
git checkout main              # Von main abzweigen
git pull                       # Aktuellen Stand holen
git checkout -b feat/xy        # Neuen Branch erstellen
```

Vor dem Branch-Erstellen immer prüfen ob bereits ein passender Branch existiert:
```bash
git branch -a | grep xy
```

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

## Dexie / DB Rules

- Schema version is currently **16** — increment when adding/changing tables or indexes
- All migration logic goes in `db.ts`, not in components
- Never call `db.version()` outside of `db.ts`

## Encryption Rules

- Never log or expose passwords or derived keys
- Always check `encryptionMode` before reading/writing entries
- Encrypted entries have `encrypted: true` and `data` as a Base64 string
- Decryption happens lazily (in HistoryView via IntersectionObserver), not eagerly

## TypeScript Rules

- All block components must accept typed `Block` variants — no `any`
- Props interfaces are defined inline or in the same file as the component
- Use type guards from `src/types/blocks.ts` when narrowing block types
