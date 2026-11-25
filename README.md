# Schmerztagebuch v3

Persönliches Schmerztagebuch als PWA mit Ende-zu-Ende-verschlüsseltem Sync (npm-Workspaces: `apps/web`, `apps/server`,
`apps/mcp`, `packages/*`). v3 hat v2 abgelöst; der v2-Code ist seit 2026-11-25 aus dem Repo entfernt (RDM-036, Historie in Git).

- Entwickeln: `npm ci`, dann `npm run verify` (Typecheck, Lint, Tests, Build); Skripte siehe `package.json`.
- Betrieb im Homelab: [DEPLOYMENT.md](DEPLOYMENT.md). `main` ist der Produktionsstand, Änderungen kommen per PR über `develop`.

## Einstieg

| Datei | Zweck |
|---|---|
| [spec/00-overview.md](spec/00-overview.md) | Vision, Prinzipien, Scope, Glossar — **zuerst lesen** |
| [spec/](spec/) | Zielspezifikationen je Bereich, jede mit Akzeptanztest-Tabelle |
| [MILESTONES.md](MILESTONES.md) | Reihenfolge M0–M13, Akzeptanz-IDs je Meilenstein, Human-Gates |
| [LOOP.md](LOOP.md) | Arbeitsprotokoll pro Loop-Iteration (Prompt für `/loop`) |
| [PROGRESS.md](PROGRESS.md) | Laufender Stand — wird vom Loop gepflegt |
| [DECISIONS.md](DECISIONS.md) | Entscheidungslog (ADR) + offene Annahmen zur Bestätigung durch den User |
| [scripts/check-acceptance.mjs](scripts/check-acceptance.mjs) | Prüft, dass jede Akzeptanz-ID einen grünen Test hat |

## Definition of Done (gesamt)

v3 ist fertig, wenn:

1. `npm run verify` grün ist (Typecheck, Lint, Unit-/Integrationstests, Build),
2. `npm run acceptance` meldet: **alle** automatisierten Akzeptanz-IDs aller Spezifikationen haben einen bestandenen Test,
3. alle `manual`-Akzeptanzkriterien in [PROGRESS.md](PROGRESS.md) vom User abgehakt sind,
4. alle Human-Gates in [MILESTONES.md](MILESTONES.md) freigegeben sind.

## Loop starten

```
/loop Arbeite nach LOOP.md
```
