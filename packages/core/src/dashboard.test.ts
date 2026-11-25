import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_MAX_WIDGETS, WIDGET_KINDS, addWidget, createDashboard, dashboardSchema, defaultWidgetConfig, moveDashboard, moveWidget, removeWidget,
  renameDashboard, updateWidget, widgetSchema, type Dashboard,
} from './dashboard.js';
import { uuidV7FromSeed } from './ids.js';

const id = (n: number) => uuidV7FromSeed(n, new Uint8Array(10).fill(n));
const stamp = (n: number) => ({ hlc: `${String(1_700_000_000_000 + n).padStart(13, '0')}:0000:devA`, updatedAt: new Date(1_700_000_000_000 + n).toISOString() });
const diaryId = id(1);
const make = (n: number, existing: Dashboard[] = []) => createDashboard({ id: id(10 + n), diaryId, name: `Dashboard ${n}` }, existing, stamp(n));

describe('Dashboard-Baukasten', () => {
  it('DM-15: Schema je Widget-Art — gültige Konfigurationen werden akzeptiert, unbekannte Art/Felder/Werte abgelehnt', () => {
    for (const kind of WIDGET_KINDS) {
      const config = kind === 'correlation' ? defaultWidgetConfig(kind, { a: id(2), b: id(3) }) : defaultWidgetConfig(kind);
      expect(widgetSchema.safeParse({ id: id(4), kind, config, span: 1 }).success, kind).toBe(true);
    }
    const ok = { id: id(4), kind: 'kpi', config: { stat: 'max', days: 7 }, span: 2 };
    expect(widgetSchema.safeParse(ok).success).toBe(true);
    expect(widgetSchema.safeParse({ ...ok, kind: 'piechart' }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...ok, span: 3 }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...ok, config: { stat: 'sum', days: 7 } }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...ok, config: { stat: 'max', days: 0 } }).success).toBe(false);
    expect(widgetSchema.safeParse({ ...ok, config: { stat: 'max', days: 7, extra: 1 } }).success).toBe(false);
    // Konfiguration einer anderen Art passt nicht
    expect(widgetSchema.safeParse({ id: id(4), kind: 'correlation', config: { days: 30 }, span: 1 }).success).toBe(false);
    expect(widgetSchema.safeParse({ id: id(4), kind: 'correlation', config: { blockIdA: id(2), blockIdB: id(3), lag: 8, days: 30 }, span: 1 }).success).toBe(false);
  });

  it('DM-15: Dashboard-Schema — Name, Stempel, Höchstzahl an Widgets, fremde Felder', () => {
    const d = make(1);
    expect(dashboardSchema.safeParse(d).success).toBe(true);
    expect(d.widgets).toEqual([]);
    expect(dashboardSchema.safeParse({ ...d, name: '  ' }).success).toBe(false);
    expect(dashboardSchema.safeParse({ ...d, hlc: '' }).success).toBe(false);
    expect(dashboardSchema.safeParse({ ...d, extra: 1 }).success).toBe(false);
    let full = d;
    for (let i = 0; i < DASHBOARD_MAX_WIDGETS; i++) full = addWidget(full, { id: id(100 + i), kind: 'medicationDays', config: { days: 30 } }, stamp(2));
    expect(() => addWidget(full, { id: id(99), kind: 'medicationDays', config: { days: 30 } }, stamp(3))).toThrow();
  });

  it('DM-15: Widgets hinzufügen, ändern, verschieben, entfernen; jede Änderung stempelt hlc und updatedAt', () => {
    let d = make(1);
    d = addWidget(d, { id: id(21), kind: 'timeseries', config: { days: 30 } }, stamp(2));
    d = addWidget(d, { id: id(22), kind: 'kpi', config: { stat: 'mean', days: 30 }, span: 2 }, stamp(3));
    d = addWidget(d, { id: id(23), kind: 'heatmap', config: { days: 90 } }, stamp(4));
    expect(d.widgets.map((w) => w.id)).toEqual([id(21), id(22), id(23)]);
    expect(d).toMatchObject({ hlc: stamp(4).hlc, updatedAt: stamp(4).updatedAt });
    expect(d.widgets[0]!.span).toBe(1);

    d = moveWidget(d, id(23), 0, stamp(5));
    expect(d.widgets.map((w) => w.id)).toEqual([id(23), id(21), id(22)]);
    d = moveWidget(d, id(23), 99, stamp(6));
    expect(d.widgets.map((w) => w.id)).toEqual([id(21), id(22), id(23)]);

    d = updateWidget(d, id(22), { config: { stat: 'max', days: 7 }, span: 1 }, stamp(7));
    expect(d.widgets[1]).toMatchObject({ kind: 'kpi', config: { stat: 'max', days: 7 }, span: 1 });
    expect(() => updateWidget(d, id(22), { config: { stat: 'nope', days: 7 } }, stamp(8))).toThrow();
    expect(() => updateWidget(d, id(77), { span: 2 }, stamp(8))).toThrow(RangeError);
    expect(() => moveWidget(d, id(77), 0, stamp(8))).toThrow(RangeError);

    d = removeWidget(d, id(21), stamp(9));
    expect(d.widgets.map((w) => w.id)).toEqual([id(22), id(23)]);
    d = renameDashboard(d, '  Meine Woche ', stamp(10));
    expect(d.name).toBe('Meine Woche');
    expect(() => renameDashboard(d, ' ', stamp(11))).toThrow();
  });

  it('DM-15: Reihenfolge der Dashboards per Fractional Index — neue hinten, Verschieben ändert nur das verschobene', () => {
    const a = make(1);
    const b = make(2, [a]);
    const c = make(3, [a, b]);
    expect(a.order < b.order && b.order < c.order).toBe(true);
    const moved = moveDashboard([a, b, c], c.id, 0, stamp(9));
    expect(moved.order < a.order).toBe(true);
    expect(moved.hlc).toBe(stamp(9).hlc);
    const mid = moveDashboard([a, b, c], a.id, 1, stamp(10)); // zwischen b und c
    expect(mid.order > b.order && mid.order < c.order).toBe(true);
    expect(() => moveDashboard([a, b], c.id, 0, stamp(11))).toThrow(RangeError);
  });
});
