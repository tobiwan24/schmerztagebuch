# Schmerztagebuch v3

Neuaufbau des Schmerztagebuchs. v2 (Repo-Root `src/`, `server/`) bleibt unverändert im Betrieb, bis v3 die Migration
(M11) bestanden hat und die Ablösung (M13, Gate G4) freigegeben ist. **Alles zu v3 liegt ausschließlich in diesem Ordner.**

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
/loop Arbeite nach v3/LOOP.md
```
