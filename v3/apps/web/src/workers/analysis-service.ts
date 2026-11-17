// Analyse-Dienst (Spec 06 „Arbeitsset"): hält Arbeitsset und Suchindex im Speicher des Web Workers. Rein und ohne DOM,
// damit er in Tests direkt (und im Worker über `attachAnalysisService`) läuft. Die Logik selbst liegt in `@stb/analysis`.
import {
  applyFilter, bodymapOverview, buildWorkingSet, comparePeriods, correlate, createSearchIndex, dailySeries, entrySeries, evaluateRules, eventMarks, medicationDaysByMonth, optionDays, trainingStats, triggerLift,
  type DailyMode, type DayRange, type FilterSpec, type NumericTarget, type SearchIndex, type SearchSnapshot, type WorkingSet, type WorkingSetInput,
} from '@stb/analysis';
import type { NotificationRule, Role } from '@stb/core';

export function createAnalysisService() {
  let ws: WorkingSet | null = null;
  let index: SearchIndex | null = null;
  const need = () => {
    if (!ws || !index) throw new Error('Arbeitsset noch nicht geladen');
    return { ws, index };
  };
  /** Einträge nach Filter (oder alle des Arbeitssets). */
  const scope = (spec: FilterSpec | undefined, now: number) => {
    const { ws: w, index: i } = need();
    return spec ? applyFilter(w, spec, { now, search: (t) => i.search(t) }) : w.entries;
  };
  return {
    /**
     * Arbeitsset laden. Der Suchindex wird beim ersten Laden aus `snapshot` (persistierter Stand, M23) aufgebaut und
     * danach nur noch inkrementell mit dem Arbeitsset abgeglichen (ANA-33).
     */
    load(input: WorkingSetInput, snapshot?: unknown) {
      ws = buildWorkingSet(input);
      if (index) index.sync(ws);
      else index = createSearchIndex(ws, snapshot === undefined ? {} : { snapshot });
      return { entries: ws.entries.length };
    },
    /** Persistierbarer Stand des Suchindex; `null`, wenn sich seit dem letzten Aufruf nichts geändert hat. */
    searchSnapshot(): SearchSnapshot | null {
      return need().index.snapshot();
    },
    filter(spec: FilterSpec, now: number) {
      return scope(spec, now).map((e) => e.id);
    },
    search(text: string) {
      return [...need().index.search(text)];
    },
    dailySeries(target: NumericTarget, opts: { spec?: FilterSpec; now: number; mode?: DailyMode }) {
      return dailySeries(scope(opts.spec, opts.now), target, opts.mode);
    },
    entrySeries(target: NumericTarget, opts: { spec?: FilterSpec; now: number }) {
      return entrySeries(scope(opts.spec, opts.now), target);
    },
    compare(target: NumericTarget, a: DayRange, b: DayRange, opts: { spec?: FilterSpec; now: number; mode?: DailyMode; threshold?: number }) {
      return comparePeriods(scope(opts.spec, opts.now), target, a, b, opts);
    },
    optionDays(target: { blockId: string } | { role: Role }, range: DayRange, opts: { spec?: FilterSpec; now: number }) {
      return optionDays(scope(opts.spec, opts.now), target, range);
    },
    medicationDays(opts: { spec?: FilterSpec; now: number }) {
      return medicationDaysByMonth(scope(opts.spec, opts.now));
    },
    events(opts: { spec?: FilterSpec; now: number }) {
      return eventMarks(scope(opts.spec, opts.now));
    },
    bodymap(opts: { spec?: FilterSpec; now: number }) {
      return bodymapOverview(scope(opts.spec, opts.now));
    },
    /** Training (ANA-24/25): Tage mit erledigten Übungen je Woche, Stufenverlauf je Übung. */
    training(opts: { spec?: FilterSpec; now: number }) {
      return trainingStats(scope(opts.spec, opts.now));
    },
    /** Zusammenhang zweier Tagesreihen mit Zeitversatz (ANA-26/28): Spearman, erst ab n ≥ 14. */
    correlation(a: NumericTarget, b: NumericTarget, lag: number, opts: { spec?: FilterSpec; now: number }) {
      const entries = scope(opts.spec, opts.now);
      return correlate(dailySeries(entries, a), dailySeries(entries, b), lag);
    },
    /** Auslöser-Analyse (ANA-27/28): Vierfeldertafel und Lift je Ereignis, erst ab 10 Fällen. */
    triggers(opts: { outcome: NumericTarget; threshold: number; lag: 0 | 1; trigger: { blockId: string } | { role: Role }; spec?: FilterSpec; now: number }) {
      return triggerLift(scope(opts.spec, opts.now), { outcome: opts.outcome, threshold: opts.threshold, lag: opts.lag, trigger: opts.trigger });
    },
    /** Hinweis-Regeln prüfen (ANA-29/30): `lastFired` = Regel-ID → ISO-Zeitpunkt der letzten Auslösung. */
    rules(rules: NotificationRule[], lastFired: Record<string, string>, now: number) {
      const { ws: w } = need();
      return evaluateRules(w.entries, rules, lastFired, now, w.timezones);
    },
    /** Numerische und Auswahl-Blöcke im Arbeitsset (für die Auswahl in den Ansichten). */
    blocks() {
      const seen = new Map<string, { blockId: string; label: string; templateName: string; type: string; role?: string }>();
      for (const e of need().ws.entries) {
        for (const f of e.fields) {
          if (!seen.has(f.blockId)) seen.set(f.blockId, { blockId: f.blockId, label: f.label, templateName: e.templateName, type: f.type, ...(f.role ? { role: f.role } : {}) });
        }
      }
      return [...seen.values()];
    },
  };
}

export type AnalysisService = ReturnType<typeof createAnalysisService>;
export type AnalysisMethod = keyof AnalysisService;

interface Port {
  postMessage(msg: unknown): void;
  addEventListener(type: 'message', fn: (e: MessageEvent) => void): void;
  start?: () => void;
}

type Request = { id: number; method: AnalysisMethod; args: unknown[] };
type Response = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

/** Worker-Seite: beantwortet Anfragen `{ id, method, args }`. */
export function attachAnalysisService(port: Port, service: AnalysisService = createAnalysisService()): void {
  port.addEventListener('message', (e: MessageEvent) => {
    const { id, method, args } = e.data as Request;
    try {
      const fn = service[method] as (...a: unknown[]) => unknown;
      port.postMessage({ id, ok: true, result: fn(...args) } satisfies Response);
    } catch (err) {
      port.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies Response);
    }
  });
  port.start?.();
}

/** Client-Seite: Methodenaufrufe als Promises (strukturiert geklont, keine Funktionen über die Grenze). */
export type AnalysisClient = { [K in AnalysisMethod]: (...args: Parameters<AnalysisService[K]>) => Promise<ReturnType<AnalysisService[K]>> };

export function createAnalysisClient(port: Port): AnalysisClient {
  let next = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  port.addEventListener('message', (e: MessageEvent) => {
    const r = e.data as Response;
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    if (r.ok) p.resolve(r.result);
    else p.reject(new Error(r.error));
  });
  port.start?.();
  const call = (method: AnalysisMethod) => (...args: unknown[]) =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      port.postMessage({ id, method, args } satisfies Request);
    });
  const methods: AnalysisMethod[] = ['load', 'filter', 'search', 'dailySeries', 'entrySeries', 'compare', 'optionDays', 'medicationDays', 'events', 'bodymap', 'training', 'correlation', 'triggers', 'rules', 'blocks', 'searchSnapshot'];
  return Object.fromEntries(methods.map((m) => [m, call(m)])) as AnalysisClient;
}
