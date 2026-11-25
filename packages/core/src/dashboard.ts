// Dashboard-Baukasten (Spec 06 „Dashboard-Baukasten“, A-091): Record-kind `dashboard`. Ein Dashboard ist eine geordnete Liste
// von Widgets; jedes Widget verweist auf eine Standard-Ansicht der Auswertung und trägt nur deren Konfiguration.
// Reihenfolge der Dashboards untereinander per Fractional Index (`order`), Reihenfolge der Widgets = Array-Reihenfolge.
import { z } from 'zod';
import { compareByOrder, keyBetween } from './fractional-index.js';
import { idSchema, isoDateTime } from './blocks/index.js';

export const WIDGET_KINDS = ['timeseries', 'heatmap', 'medicationDays', 'frequency', 'bodymap', 'correlation', 'kpi'] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];
export const DASHBOARD_MAX_WIDGETS = 24;
export const KPI_STATS = ['mean', 'median', 'max', 'min'] as const;

const days = z.number().int().min(1).max(3650);

/** Konfiguration je Widget-Art; `blockId` fehlt = Standardfeld der Ansicht (Rolle `outcome`). */
export const WIDGET_CONFIG = {
  timeseries: z.strictObject({ blockId: idSchema.optional(), days }),
  heatmap: z.strictObject({ blockId: idSchema.optional(), days }),
  medicationDays: z.strictObject({ days }),
  frequency: z.strictObject({ blockId: idSchema.optional(), days }),
  bodymap: z.strictObject({ blockId: idSchema.optional(), days }),
  correlation: z.strictObject({ blockIdA: idSchema, blockIdB: idSchema, lag: z.number().int().min(0).max(7), days }),
  kpi: z.strictObject({ blockId: idSchema.optional(), stat: z.enum(KPI_STATS), days }),
} as const;

const widget = <K extends WidgetKind>(kind: K) =>
  z.strictObject({ id: idSchema, kind: z.literal(kind), config: WIDGET_CONFIG[kind], span: z.union([z.literal(1), z.literal(2)]) });

export const widgetSchema = z.discriminatedUnion('kind', [
  widget('timeseries'), widget('heatmap'), widget('medicationDays'), widget('frequency'), widget('bodymap'), widget('correlation'), widget('kpi'),
]);
export type Widget = z.infer<typeof widgetSchema>;

export const dashboardSchema = z.strictObject({
  id: idSchema,
  diaryId: idSchema,
  name: z.string().trim().min(1).max(80),
  order: z.string().min(1),
  widgets: z.array(widgetSchema).max(DASHBOARD_MAX_WIDGETS),
  hlc: z.string().min(1),
  updatedAt: isoDateTime,
});
export type Dashboard = z.infer<typeof dashboardSchema>;

type Stamp = { hlc: string; updatedAt: string };

/** Standardkonfiguration einer neuen Widget-Art (Zeitraum 30 Tage, Korrelation 90). */
export function defaultWidgetConfig(kind: 'correlation', blocks: { a: string; b: string }): Widget['config'];
export function defaultWidgetConfig(kind: Exclude<WidgetKind, 'correlation'>): Widget['config'];
export function defaultWidgetConfig(kind: WidgetKind, blocks?: { a: string; b: string }): Widget['config'] {
  if (kind === 'correlation') return { blockIdA: blocks!.a, blockIdB: blocks!.b, lag: 0, days: 90 };
  if (kind === 'kpi') return { stat: 'mean', days: 30 };
  return { days: 30 };
}

/** Neues, leeres Dashboard; `order` steht hinter allen vorhandenen Dashboards des Tagebuchs. */
export function createDashboard(input: { id: string; diaryId: string; name: string }, existing: readonly Dashboard[], stamp: Stamp): Dashboard {
  const last = [...existing].sort(compareByOrder).at(-1)?.order ?? null;
  return dashboardSchema.parse({ id: input.id, diaryId: input.diaryId, name: input.name, order: keyBetween(last, null), widgets: [], ...stamp });
}

const touch = (d: Dashboard, patch: Partial<Dashboard>, stamp: Stamp): Dashboard => dashboardSchema.parse({ ...d, ...patch, ...stamp });

export const renameDashboard = (d: Dashboard, name: string, stamp: Stamp): Dashboard => touch(d, { name }, stamp);

/** Hängt ein Widget an (Spannweite 1); wirft bei ungültiger Konfiguration oder mehr als `DASHBOARD_MAX_WIDGETS`. */
export function addWidget(d: Dashboard, input: { id: string; kind: WidgetKind; config: unknown; span?: 1 | 2 }, stamp: Stamp): Dashboard {
  return touch(d, { widgets: [...d.widgets, widgetSchema.parse({ id: input.id, kind: input.kind, config: input.config, span: input.span ?? 1 })] }, stamp);
}

export function updateWidget(d: Dashboard, widgetId: string, patch: { config?: unknown; span?: 1 | 2 }, stamp: Stamp): Dashboard {
  if (!d.widgets.some((w) => w.id === widgetId)) throw new RangeError(`Widget ${widgetId} nicht gefunden`);
  return touch(d, { widgets: d.widgets.map((w) => (w.id === widgetId ? widgetSchema.parse({ ...w, ...patch }) : w)) }, stamp);
}

export const removeWidget = (d: Dashboard, widgetId: string, stamp: Stamp): Dashboard => touch(d, { widgets: d.widgets.filter((w) => w.id !== widgetId) }, stamp);

/** Verschiebt ein Widget an die Position `toIndex` (0-basiert, begrenzt auf die Liste). */
export function moveWidget(d: Dashboard, widgetId: string, toIndex: number, stamp: Stamp): Dashboard {
  const from = d.widgets.findIndex((w) => w.id === widgetId);
  if (from < 0) throw new RangeError(`Widget ${widgetId} nicht gefunden`);
  const rest = d.widgets.filter((w) => w.id !== widgetId);
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, d.widgets[from]!);
  return touch(d, { widgets: rest }, stamp);
}

/** Verschiebt ein Dashboard an die Position `toIndex` unter den Dashboards desselben Tagebuchs (neuer Fractional Index). */
export function moveDashboard(all: readonly Dashboard[], dashboardId: string, toIndex: number, stamp: Stamp): Dashboard {
  const sorted = [...all].sort(compareByOrder);
  const me = sorted.find((d) => d.id === dashboardId);
  if (!me) throw new RangeError(`Dashboard ${dashboardId} nicht gefunden`);
  const rest = sorted.filter((d) => d.id !== dashboardId);
  const i = Math.max(0, Math.min(toIndex, rest.length));
  return touch(me, { order: keyBetween(rest[i - 1]?.order ?? null, rest[i]?.order ?? null) }, stamp);
}
