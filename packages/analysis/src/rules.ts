// Schwellwert-Hinweise auswerten (Spec 06, A-089/A-113): aufeinanderfolgende Tage in der Tagebuch-Zeitzone, Cooldown,
// rein beschreibender Text ohne Empfehlung.
import type { NotificationRule } from '@stb/core';
import { dayIn, type WsEntry } from './working-set.js';

export interface FiredRule {
  ruleId: string;
  text: string;
  /** Letzter Tag der Serie (`YYYY-MM-DD`). */
  lastDay: string;
}

const DAY_MS = 86_400_000;
const shift = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const fmt = (n: number): string => String(n).replace('.', ',');

/** Beschreibender Text, z. B. „Schmerz ≥ 7 an 3 Tagen in Folge“. */
export function ruleText(label: string, rule: Pick<NotificationRule, 'op' | 'value' | 'consecutiveDays'>): string {
  const when = rule.consecutiveDays === 1 ? 'an 1 Tag' : `an ${rule.consecutiveDays} Tagen in Folge`;
  return `${label} ${rule.op === '>=' ? '≥' : '≤'} ${fmt(rule.value)} ${when}`;
}

/**
 * Prüft Regeln gegen die Einträge. Tageswert: höchster (`>=`) bzw. niedrigster (`<=`) Wert des Tages. Die Serie muss am
 * heutigen oder gestrigen Tag (Tagebuch-Zeitzone) enden. `lastFired`: Regel-ID → ISO-Zeitpunkt der letzten Auslösung;
 * innerhalb von `cooldownHours` wird nicht erneut ausgelöst.
 */
export function evaluateRules(
  entries: readonly WsEntry[],
  rules: readonly NotificationRule[],
  lastFired: Readonly<Record<string, string>>,
  now: Date | string | number,
  timezones: ReadonlyMap<string, string> | Readonly<Record<string, string>> = {},
): FiredRule[] {
  const nowMs = new Date(now).getTime();
  const out: FiredRule[] = [];
  for (const rule of rules) {
    const last = lastFired[rule.id];
    if (last && nowMs - Date.parse(last) < rule.cooldownHours * 3_600_000) continue;
    const mine = entries.filter((e) => e.diaryId === rule.diaryId);
    const tz = (timezones instanceof Map ? timezones.get(rule.diaryId) : (timezones as Record<string, string>)[rule.diaryId]) ?? 'UTC';
    const today = dayIn(nowMs, tz);
    const byDay = extremePerDay(mine, rule.blockId, rule.op === '>=' ? 'max' : 'min');
    const ok = (day: string): boolean => {
      const v = byDay.get(day);
      return v !== undefined && (rule.op === '>=' ? v >= rule.value : v <= rule.value);
    };
    const end = [today, shift(today, -1)].find(ok);
    if (!end) continue;
    let n = 0;
    while (n < rule.consecutiveDays && ok(shift(end, -n))) n++;
    if (n < rule.consecutiveDays) continue;
    const label = mine.flatMap((e) => e.fields).find((f) => f.blockId === rule.blockId)?.label ?? rule.blockId;
    out.push({ ruleId: rule.id, text: ruleText(label, rule), lastDay: end });
  }
  return out;
}

function extremePerDay(entries: readonly WsEntry[], blockId: string, mode: 'min' | 'max'): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    for (const f of e.fields) {
      if (f.blockId !== blockId || f.value.kind !== 'numeric') continue;
      const v = f.value.value;
      const cur = m.get(e.day);
      if (cur === undefined || (mode === 'max' ? v > cur : v < cur)) m.set(e.day, v);
    }
  }
  return m;
}
