// Hinweis-Regeln (M20, A-089/A-113): nach jedem Laden des Arbeitssets (Speichern, Sync, Start) prüfen; Treffer erscheinen als
// Start-Banner und — wenn erlaubt — als lokale Notification. Der Cooldown steht je Gerät in den Schlüsseln der DB.
import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { showViaServiceWorker } from '@/reminders/reminders';
import { de } from '@/i18n/de';
import { useAnalysis } from './AnalysisContext';
import { useData } from './DataContext';
import { loadLastFired, saveLastFired } from './rule-state';

export interface RuleHint {
  ruleId: string;
  text: string;
}

let hints: RuleHint[] = [];
const listeners = new Set<() => void>();
const emit = (next: RuleHint[]) => {
  hints = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Aktuelle Hinweise für das Start-Banner. */
export function useRuleHints(): { hints: RuleHint[]; dismiss: (ruleId: string) => void } {
  const current = useSyncExternalStore(subscribe, () => hints);
  return { hints: current, dismiss: (ruleId) => emit(hints.filter((h) => h.ruleId !== ruleId)) };
}

let running: Promise<void> = Promise.resolve();

/** Im AppShell: prüft die Regeln, sobald das Arbeitsset (neu) geladen ist. */
export function useRuleEvaluation(): void {
  const { db, now } = useAuth();
  const { diary } = useData();
  const { client, version } = useAnalysis();
  useEffect(() => {
    if (!client || version === 0) return;
    let cancelled = false;
    running = running.then(async () => {
      if (cancelled) return;
      const diaries = await diary.listDiaries();
      const rules = (await Promise.all(diaries.map((d) => diary.listNotificationRules(d.id)))).flat();
      if (!rules.length || cancelled) return;
      const lastFired = await loadLastFired(db);
      const at = now();
      const fired = await client.rules(rules, lastFired, at);
      if (!fired.length || cancelled) return;
      const next = { ...lastFired };
      for (const f of fired) next[f.ruleId] = new Date(at).toISOString();
      await saveLastFired(db, next);
      emit([...hints.filter((h) => !fired.some((f) => f.ruleId === h.ruleId)), ...fired.map((f) => ({ ruleId: f.ruleId, text: f.text }))]);
      for (const f of fired) await showViaServiceWorker(de.hints.notificationTitle, f.text, `stb-rule-${f.ruleId}`).catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, version, db, now, diary]);
}
