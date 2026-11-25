# LOOP — Arbeitsprotokoll pro Iteration

Gestartet mit: `/loop Arbeite nach LOOP.md`. Jede Iteration arbeitet **eine** kleine, abgeschlossene Aufgabe ab.

## Feste Regeln

- Arbeitsverzeichnis ist die Repo-Wurzel (seit 2026-11-25, RDM-036; v2-Code ist entfernt).
- Branch: `feat/v3`. Vor jeder Iteration `git branch --show-current` prüfen; ist es nicht `feat/v3` → anhalten und melden.
- **Nie pushen, nie mergen, nie `main` oder `develop` auschecken.**
- Specs (`spec/*`) sind die Wahrheit. Widerspricht die Umsetzung einer Spec oder ist eine Spec unklar/unmöglich:
  nicht still abweichen, sondern Annahme in `DECISIONS.md` unter „Offene Annahmen" eintragen und eine Alternative wählen,
  die sich leicht ändern lässt. Akzeptanzkriterien nie abschwächen, um Tests grün zu bekommen.
- Neue npm-Abhängigkeit: erlaubt, aber vorher Eintrag in `DECISIONS.md` (Name, Zweck, Lizenz, verworfene Alternative).
- shadcn/ui ist das einzige UI-Kit (siehe Spec 10). **Nur shadcn-Originale**; jede Ausnahme (Nachbau, Anpassung, Fremd-UI-Paket,
  nicht freigegebenes HTML-Element) braucht die ausdrückliche Freigabe des Users (Register `spec/ui-components.json`, UI-33,
  A-147). Der Loop trägt **nie selbst** eine Freigabe ins Register oder in `DECISIONS.md` ein.
- Keine Secrets, keine echten Gesundheitsdaten in Fixtures (nur synthetisch bzw. anonymisiert).

## Ablauf einer Iteration

1. **Orientieren:** `PROGRESS.md` lesen (aktueller Meilenstein, nächste Aufgabe, Blocker, Gate-Feedback).
   `git log --oneline -5` und `git status` prüfen. Bei unerwarteten uncommitteten Änderungen: anhalten und melden.
2. **Gate prüfen:** Ist der aktuelle Meilenstein M7 oder später und `UI-10` in `PROGRESS.md` nicht abgehakt → anhalten
   (G1 offen). Analog: M9 erst nach `UI-11`, M12 erst nach `UI-12`. Beim Anhalten: Loop beenden und kurz melden,
   was der User prüfen soll.
3. **Aufgabe wählen:** die nächste offene Aufgabe des aktuellen Meilensteins. Gibt es keine Aufgabenliste: aus den
   offenen Akzeptanz-IDs (`npm run acceptance -- --milestone Mx`) 1–3 zusammenhängende IDs wählen.
4. **Test zuerst:** Tests schreiben, deren Namen mit den Akzeptanz-IDs beginnen (`it('DM-04: …')`). Test schlägt fehl.
5. **Umsetzen:** minimal, entlang der Spec. Pure Logik in `packages/*`.
6. **Prüfen:** `npm run verify` muss grün sein. Danach `npm run acceptance -- --milestone Mx`.
7. **Festhalten:** `PROGRESS.md` aktualisieren (erledigte IDs, nächste Aufgabe, Erkenntnisse, Blocker).
8. **Commit** auf `feat/v3`: `feat(v3/<bereich>): <kurz> [IDs]`, z. B. `feat(v3/core): Fractional Index [DM-04 DM-05]`,
   mit der Co-Authored-By-Zeile aus der Session.
9. **Meilenstein fertig?** Wenn `--milestone Mx` „OK" meldet: Meilenstein in `PROGRESS.md` als erledigt markieren,
   nächsten eintragen. Folgt ein Gate: Material für das Gate vorbereiten (siehe Spec 10), Loop beenden, melden.

## Anhalten (Loop beenden und melden) bei

- offenem Gate,
- dreimal hintereinander rotem `verify` bei derselben Aufgabe (Blocker mit Fehlerausgabe in `PROGRESS.md`),
- einer Entscheidung, die nur der User treffen kann (Eintrag in `DECISIONS.md` → „Offene Annahmen", Status `blockiert`),
- Bedarf an einer UI-Ausnahme von „nur shadcn“ (kein passendes shadcn-Original) — anhalten und melden, nicht selbst freigeben,
- Bedarf, etwas außerhalb des Repos zu ändern,
- Erreichen der Gesamt-Definition-of-Done (`npm run acceptance` ohne `--milestone` = OK bis auf manuelle IDs).

## Iterationsgröße

Eine Iteration soll in einem Commit enden, der für sich verständlich ist (typisch 1–3 Akzeptanz-IDs, < 500 geänderte
Zeilen ohne Fixtures/Lockfile). Große Aufgaben vorher in `PROGRESS.md` in Teilaufgaben zerlegen.
