// Auswertung (Spec 06 „Standard-Ansichten", Wireframe auswertung.html): Verlauf, Kalender, Medikamententage, Häufigkeiten,
// Körperkarte — fest, nicht konfigurierbar. Dazu der Zeitraumvergleich. Rein beschreibend, jede Kennzahl mit n.
// Daten aus dem Analyse-Worker (`useAnalysis`).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageDown } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, type FilterSpec } from '@stb/analysis';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { BODYMAP_PRESETS, intensityFill } from '@/components/blocks/bodymap-presets';
import { useAnalysis } from '@/data/AnalysisContext';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import type { AnalysisClient } from '@/workers/analysis-service';
import { cn } from '@/lib/utils';
import { exportViewAsPng } from '@/lib/export-png';
import { de } from '@/i18n/de';

type View = 'trend' | 'calendar' | 'meds' | 'freq' | 'body';
type Range = '7d' | '30d' | '90d' | '1y';
const VIEWS: View[] = ['trend', 'calendar', 'meds', 'freq', 'body'];
const RANGES: Range[] = ['7d', '30d', '90d', '1y'];
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const today = (now: number) => new Date(now).toLocaleDateString('en-CA');
const fmt = (n: number | null, digits = 1) => (n === null ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: digits }));
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
/** Tag mit Jahr (`TT.MM.JJJJ`) — für Zeiträume, die nicht eindeutig im laufenden Jahr liegen. */
const longDay = (day: string) => `${shortDay(day)}${day.slice(0, 4)}`;
/** Mindestweg (px) für eine Wisch-Geste, die den Zeitraum verschiebt (Spec 06 „Touch"). */
const SWIPE_PX = 60;

/** Abfrage an den Worker, neu bei geändertem Arbeitsset (`version`) oder Abhängigkeiten. */
function useWorker<T>(fn: (c: AnalysisClient) => Promise<T>, deps: readonly unknown[]): T | null {
  const { client, version } = useAnalysis();
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void fn(client).then((d) => !cancelled && setData(d));
    return () => {
      cancelled = true;
    };
    // `fn` ist pro Render neu; neu geladen wird über `deps` und `version`.
  }, [client, version, ...deps]);
  return data;
}

export function AnalysisPage() {
  const { diary, now } = useData();
  const scope = useDiaryScope(true);
  const entries = useQuery(async () => ({ count: (await diary.listAllEntries()).length, diaryIds: (await diary.listDiaries()).map((d) => d.id) }), [diary]);
  const [view, setView] = useState<View>('trend');
  const [range, setRange] = useState<Range>('30d');
  /** Wie viele Zeiträume zurück (0 = bis heute); Wischen nach rechts = älter, nach links = neuer. */
  const [shift, setShift] = useState(0);
  const viewRef = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  if (entries.status === 'error') return (<><PageHeader title={de.analysis.title} /><ErrorState onRetry={entries.retry} /></>);
  if (entries.status === 'loading') return (<><PageHeader title={de.analysis.title} /><p className="text-muted-foreground">{de.app.loading}</p></>);
  if (entries.data.count === 0) return (<><PageHeader title={de.analysis.title} /><EmptyState title={de.analysis.emptyTitle} hint={de.analysis.emptyHint} /></>);
  const to = addDays(today(now()), -shift * RANGE_DAYS[range]);
  const from = addDays(to, -(RANGE_DAYS[range] - 1));
  const older = () => setShift((s) => s + 1);
  const newer = () => setShift((s) => Math.max(0, s - 1));
  const diaryIds = scope.diaryId ? [scope.diaryId] : entries.data.diaryIds;
  const spec: FilterSpec = { diaryIds, range: { from, to } };

  async function exportPng() {
    if (!viewRef.current) return;
    setExporting(true);
    try {
      const period = view === 'calendar' ? '' : ` · ${shortDay(from)}–${shortDay(to)}${to.slice(0, 4)}`;
      await exportViewAsPng(viewRef.current, `${de.analysis.viewNames[view]}${period}`, de.analysis.pngFileName(view, to));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader title={de.analysis.title} />
      <ToggleGroup aria-label={de.analysis.views}>
        {VIEWS.map((v) => (
          <ToggleGroupItem key={v} pressed={view === v} onClick={() => setView(v)} className="px-1 text-xs">
            {de.analysis.viewNames[v]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {view !== 'calendar' ? (
        <ToggleGroup aria-label={de.history.range}>
          {RANGES.map((r) => (
            <ToggleGroupItem key={r} pressed={range === r} onClick={() => (setRange(r), setShift(0))}>
              {de.analysis.ranges[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      {view !== 'calendar' ? (
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" aria-label={de.analysis.olderPeriod} onClick={older}>‹</Button>
          <span data-testid="analysis-period" className="text-sm tabular-nums">{longDay(from)} – {longDay(to)}</span>
          <Button size="sm" variant="ghost" aria-label={de.analysis.newerPeriod} disabled={shift === 0} onClick={newer}>›</Button>
        </div>
      ) : null}
      <Button variant="outline" size="sm" className="self-end" disabled={exporting} onClick={() => void exportPng()}>
        <ImageDown aria-hidden />
        {de.analysis.exportPng}
      </Button>
      <section
        ref={viewRef}
        data-testid={`analysis-view-${view}`}
        className="flex touch-pan-y flex-col gap-3"
        onPointerDown={(e) => (swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || view === 'calendar') return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y) * 2) (dx > 0 ? older : newer)();
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        {view === 'trend' ? <TrendView spec={spec} /> : null}
        {view === 'calendar' ? <CalendarView diaryIds={diaryIds} /> : null}
        {view === 'meds' ? <MedsView spec={spec} /> : null}
        {view === 'freq' ? <FreqView spec={spec} from={from} to={to} /> : null}
        {view === 'body' ? <BodyView spec={spec} /> : null}
      </section>
      {view !== 'calendar' ? <CompareCard diaryIds={diaryIds} from={from} to={to} /> : null}
    </>
  );
}

/** Feldauswahl; gleich benannte Felder verschiedener Vorlagen tragen den Vorlagennamen. */
function BlockPicker({ blocks, value, onChange }: { blocks: { blockId: string; label: string; templateName: string }[]; value: string | undefined; onChange: (id: string) => void }) {
  if (blocks.length < 2) return null;
  const dup = (label: string) => blocks.filter((b) => b.label === label).length > 1;
  return (
    <div role="group" aria-label={de.analysis.block} className="flex flex-wrap gap-2">
      {blocks.map((b) => (
        <Button key={b.blockId} size="sm" variant={b.blockId === value ? 'default' : 'outline'} aria-pressed={b.blockId === value} onClick={() => onChange(b.blockId)}>
          {dup(b.label) ? de.analysis.blockOf(b.label, b.templateName) : b.label}
        </Button>
      ))}
    </div>
  );
}

function TrendView({ spec }: { spec: FilterSpec }) {
  const { now } = useData();
  const key = JSON.stringify(spec);
  const blocks = useWorker((c) => c.blocks(), []);
  const numeric = (blocks ?? []).filter((b) => b.type === 'slider');
  const [picked, setPicked] = useState<string>();
  const blockId = picked ?? numeric.find((b) => b.role === 'outcome')?.blockId ?? numeric[0]?.blockId;
  const series = useWorker((c) => (blockId ? c.dailySeries({ blockId }, { spec, now: now() }) : Promise.resolve([])), [key, blockId]);
  const events = useWorker((c) => c.events({ spec, now: now() }), [key]);
  if (!series) return <p className="text-muted-foreground">{de.app.loading}</p>;
  const label = numeric.find((b) => b.blockId === blockId)?.label ?? '';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{de.analysis.trendTitle(label)}</CardTitle>
        <p className="text-xs text-muted-foreground" data-testid="trend-n">{de.analysis.nDays(series.length)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <BlockPicker blocks={numeric} value={blockId} onChange={setPicked} />
        {series.length === 0 ? <p className="text-sm text-muted-foreground">{de.analysis.noValues}</p> : (
          <ChartContainer config={{ value: { label, color: 'var(--chart-1)' } }}>
            <LineChart data={series.map((d) => ({ day: d.day, value: d.value }))} margin={{ left: -20, right: 8, top: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltipContent />} labelFormatter={(d) => shortDay(String(d))} />
              <Line dataKey="value" name={label} type="monotone" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              {(events ?? []).map((ev, i) => (
                <ReferenceLine
                  key={`${ev.day}-${i}`}
                  x={ev.day}
                  stroke={ev.category === 'doctor' ? 'var(--chart-2)' : 'var(--chart-3)'}
                  strokeDasharray="3 3"
                  label={{ value: '◆', position: 'top', fill: 'currentColor' }}
                  className="event-mark"
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
        {(events ?? []).length ? (
          <ul data-testid="event-marks" className="flex flex-col gap-1 text-xs text-muted-foreground">
            {events!.map((ev, i) => (
              <li key={i}>{`◆ ${shortDay(ev.day)} ${ev.category === 'doctor' ? de.analysis.doctor : de.analysis.event}: ${ev.title}`}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CalendarView({ diaryIds }: { diaryIds: string[] }) {
  const { now } = useData();
  const [offset, setOffset] = useState(0);
  const base = new Date(now());
  const month = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const first = month.toLocaleDateString('en-CA');
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const last = addDays(first, daysInMonth - 1);
  const blocks = useWorker((c) => c.blocks(), []);
  const outcome = (blocks ?? []).find((b) => b.role === 'outcome' && b.type === 'slider') ?? (blocks ?? []).find((b) => b.type === 'slider');
  const series = useWorker(
    (c) => (outcome ? c.dailySeries({ blockId: outcome.blockId }, { spec: { diaryIds, range: { from: first, to: last } }, now: now() }) : Promise.resolve([])),
    [first, outcome?.blockId, diaryIds.join()],
  );
  const values = new Map((series ?? []).map((d) => [d.day, d.value]));
  const lead = (month.getDay() + 6) % 7; // Montag zuerst
  const bucket = (v: number) => (v <= 2 ? 'bg-green-200 dark:bg-green-900' : v <= 4 ? 'bg-yellow-200 dark:bg-yellow-900' : v <= 6 ? 'bg-orange-300 dark:bg-orange-800' : 'bg-red-400 dark:bg-red-800');
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <Button size="sm" variant="ghost" aria-label={de.analysis.prevMonth} onClick={() => setOffset(offset - 1)}>‹</Button>
        <CardTitle className="text-base">{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</CardTitle>
        <Button size="sm" variant="ghost" aria-label={de.analysis.nextMonth} onClick={() => setOffset(offset + 1)}>›</Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{outcome ? de.analysis.calendarHint(outcome.label) : de.analysis.noValues}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-xs" data-testid="calendar-grid">
          {de.analysis.weekdays.map((w) => (
            <span key={w} className="text-muted-foreground">{w}</span>
          ))}
          {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = addDays(first, i);
            const v = values.get(day);
            return (
              <span
                key={day}
                data-testid="calendar-day"
                data-value={v ?? ''}
                title={v === undefined ? `${shortDay(day)} ${de.analysis.noEntry}` : `${shortDay(day)}: ${fmt(v)}`}
                className={cn('flex aspect-square items-center justify-center rounded-md border', v === undefined ? 'text-muted-foreground' : bucket(v))}
              >
                {i + 1}
              </span>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function MedsView({ spec }: { spec: FilterSpec }) {
  const { now } = useData();
  const meds = useWorker((c) => c.medicationDays({ spec, now: now() }), [JSON.stringify(spec)]);
  const [marker, setMarker] = useState('');
  const { rows, labels } = useMemo(() => {
    const labels = [...new Set((meds ?? []).map((m) => m.label))];
    const byMonth = new Map<string, Record<string, number | string>>();
    for (const m of meds ?? []) {
      const r = byMonth.get(m.month) ?? { month: m.month };
      r[m.label] = m.days;
      byMonth.set(m.month, r);
    }
    return { rows: [...byMonth.values()], labels };
  }, [meds]);
  if (!meds) return <p className="text-muted-foreground">{de.app.loading}</p>;
  const config = Object.fromEntries(labels.map((l, i) => [`m${i}`, { label: l, color: PALETTE[i % PALETTE.length]! }]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{de.analysis.medicationDays}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{de.analysis.noMedication}</p> : (
          <ChartContainer config={config}>
            <BarChart data={rows} margin={{ left: -20, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={(m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltipContent />} />
              {labels.map((l, i) => <Bar key={l} dataKey={l} name={l} fill={PALETTE[i % PALETTE.length]} isAnimationActive={false} />)}
              {Number(marker) > 0 ? <ReferenceLine y={Number(marker)} stroke="var(--destructive)" strokeDasharray="4 4" ifOverflow="extendDomain" /> : null}
            </BarChart>
          </ChartContainer>
        )}
        {rows.length ? (
          <ul data-testid="meds-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {labels.map((l, i) => (
              <li key={l} className="flex items-center gap-2">
                <svg aria-hidden className="size-3" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill={PALETTE[i % PALETTE.length]} /></svg>
                {l}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex items-center gap-2">
          <Label htmlFor="med-marker" className="font-normal">{de.analysis.markerLine}</Label>
          <Input id="med-marker" type="number" min={0} inputMode="numeric" className="w-24" value={marker} onChange={(e) => setMarker(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function FreqView({ spec, from, to }: { spec: FilterSpec; from: string; to: string }) {
  const { now } = useData();
  const blocks = useWorker((c) => c.blocks(), []);
  const choice = (blocks ?? []).filter((b) => b.type === 'multiselect' || b.type === 'checkbox');
  const [picked, setPicked] = useState<string>();
  const blockId = picked ?? choice[0]?.blockId;
  const days = useWorker((c) => (blockId ? c.optionDays({ blockId }, { from, to }, { spec, now: now() }) : Promise.resolve([])), [JSON.stringify(spec), blockId]);
  if (!days) return <p className="text-muted-foreground">{de.app.loading}</p>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{de.analysis.frequencies}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <BlockPicker blocks={choice} value={blockId} onChange={setPicked} />
        {days.length === 0 ? <p className="text-sm text-muted-foreground">{de.analysis.noValues}</p> : (
          <ChartContainer config={{ days: { label: de.analysis.daysLabel, color: 'var(--chart-2)' } }} className={days.length <= 4 ? 'h-40' : days.length <= 7 ? 'h-64' : 'h-96'}>
            <BarChart data={days.map((d) => ({ label: d.label, days: d.days }))} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltipContent />} />
              <Bar dataKey="days" name={de.analysis.daysLabel} fill="var(--color-days)" radius={4} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function BodyView({ spec }: { spec: FilterSpec }) {
  const { now, diary } = useData();
  const overview = useWorker((c) => c.bodymap({ spec, now: now() }), [JSON.stringify(spec)]);
  const own = useQuery(async () => (await Promise.all(spec.diaryIds.map((d) => diary.listBodymapImages(d)))).flat(), [diary, spec.diaryIds.join()]);
  if (!overview) return <p className="text-muted-foreground">{de.app.loading}</p>;
  if (overview.length === 0) return <p className="text-sm text-muted-foreground">{de.analysis.noValues}</p>;
  const srcOf = (id: string) => BODYMAP_PRESETS.find((p) => p.id === id)?.src ?? (own.status === 'ok' ? own.data.find((i) => i.id === id)?.dataUrl : undefined);
  const nameOf = (id: string) => de.bodymap.presets[id as keyof typeof de.bodymap.presets] ?? (own.status === 'ok' ? own.data.find((i) => i.id === id)?.name : undefined) ?? id;
  return (
    <>
      {overview.map((o) => (
        <Card key={o.presetId}>
          <CardHeader>
            <CardTitle className="text-base">{nameOf(o.presetId)}</CardTitle>
            <p className="text-xs text-muted-foreground">{de.analysis.bodymapCount(o.entries, o.points.length)}</p>
          </CardHeader>
          <CardContent>
            <OverviewImage src={srcOf(o.presetId)} alt={nameOf(o.presetId)} points={o.points} />
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function CompareCard({ diaryIds, from, to }: { diaryIds: string[]; from: string; to: string }) {
  const { now } = useData();
  const len = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const prev = { from: addDays(from, -len), to: addDays(from, -1) };
  const [threshold, setThreshold] = useState('6');
  const t = Number(threshold) || 0;
  const cmp = useWorker(
    (c) => c.compare({ role: 'outcome' }, prev, { from, to }, { spec: { diaryIds, range: { preset: 'all' } }, now: now(), threshold: t }),
    [from, to, t, diaryIds.join()],
  );
  if (!cmp) return null;
  const rows: [string, number | null, number | null, number | null][] = [
    [de.analysis.count, cmp.b.n, cmp.a.n, cmp.b.n - cmp.a.n],
    [de.analysis.mean, cmp.b.mean, cmp.a.mean, cmp.diff.mean],
    [de.analysis.median, cmp.b.median, cmp.a.median, cmp.diff.median],
    [de.analysis.min, cmp.b.min, cmp.a.min, cmp.diff.min],
    [de.analysis.max, cmp.b.max, cmp.a.max, cmp.diff.max],
    [de.analysis.daysAtOrAbove, cmp.b.daysAtOrAbove, cmp.a.daysAtOrAbove, cmp.diff.daysAtOrAbove],
    [de.analysis.daysWithEntry, cmp.b.daysWithEntry, cmp.a.daysWithEntry, cmp.b.daysWithEntry - cmp.a.daysWithEntry],
  ];
  const sign = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${fmt(v)}`);
  return (
    <Card data-testid="compare-card">
      <CardHeader>
        <CardTitle className="text-base">{de.analysis.compareTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">{de.analysis.compareRanges(longDay(from), longDay(to), longDay(prev.from), longDay(prev.to))}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-sm">
          <span />
          <span className="text-right text-xs text-muted-foreground">{de.analysis.currentPeriod}</span>
          <span className="text-right text-xs text-muted-foreground">{de.analysis.previousPeriod}</span>
          <span className="text-right text-xs text-muted-foreground">{de.analysis.difference}</span>
          {rows.map(([label, cur, before, diff]) => (
            <div key={label} className="contents">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-right tabular-nums">{fmt(cur)}</span>
              <span className="text-right tabular-nums">{fmt(before)}</span>
              <span className="text-right tabular-nums">{sign(diff)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="compare-threshold" className="font-normal">{de.analysis.threshold}</Label>
          <Input id="compare-threshold" type="number" min={0} inputMode="numeric" className="w-20" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        {cmp.fewData ? <p role="note" data-testid="few-data" className="text-sm text-muted-foreground">{de.analysis.fewData}</p> : null}
        <p className="text-xs text-muted-foreground">{de.analysis.descriptiveOnly}</p>
      </CardContent>
    </Card>
  );
}

/** Bild + Punkte im Koordinatensystem der echten Bildmaße (wie die Eingabe-Body-Map), damit `object-contain` nicht verschiebt. */
function OverviewImage({ src, alt, points }: { src: string | undefined; alt: string; points: { x: number; y: number; intensity?: number }[] }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const opacity = Math.min(0.9, 0.25 + 0.6 / Math.sqrt(points.length));
  return (
    <div className="relative" data-testid="bodymap-overview">
      {src ? <img src={src} alt={alt} className="block max-h-[50vh] w-full object-contain" onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} /> : null}
      {dims ? (
        <svg className="absolute inset-0 size-full" viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
          {points.map((p, i) => (
            <circle key={i} cx={p.x * dims.w} cy={p.y * dims.h} r={dims.w * 0.025} className={intensityFill(p.intensity)} opacity={opacity} />
          ))}
        </svg>
      ) : null}
    </div>
  );
}

