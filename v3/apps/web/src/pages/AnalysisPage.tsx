// Auswertung (Spec 06 „Standard-Ansichten", Wireframe auswertung.html): Verlauf, Kalender, Medikamententage, Häufigkeiten,
// Körperkarte — fest, nicht konfigurierbar. Dazu der Zeitraumvergleich. Rein beschreibend, jede Kennzahl mit n.
// Daten aus dem Analyse-Worker (`useAnalysis`).
import { TOUR_RING } from '@/tour/anchor';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus, ImageDown } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, type FilterSpec } from '@stb/analysis';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Carousel, CarouselContent, CarouselDots, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ChartEntryDialog } from '@/components/ChartEntryDialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState } from '@/components/StateView';
import { BODYMAP_PRESETS, intensityFill } from '@/components/blocks/bodymap-presets';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import { BlockPicker, useWorker } from '@/components/AnalysisShared';
import { cn } from '@/lib/utils';
import { exportViewAsPng, renderViewAsPng } from '@/lib/export-png';
import { de } from '@/i18n/de';
import { deAnalysis } from '@/i18n/lazy/analysis';
import { deBodymap } from '@/i18n/lazy/bodymap';

type View = 'trend' | 'calendar' | 'meds' | 'freq' | 'body' | 'corr' | 'training' | 'dashboards';
type Range = 'day' | '7d' | '30d' | '90d' | '6m' | '1y';
const VIEWS: View[] = ['trend', 'calendar', 'meds', 'freq', 'body', 'corr', 'dashboards'];
/** „Übungen“ erscheint nur, wenn es erledigte Übungen gibt (ANA-25). */
const VIEWS_WITH_TRAINING: View[] = [...VIEWS, 'training'];
const DashboardsView = lazy(() => import('@/components/DashboardsView').then((m) => ({ default: m.DashboardsView })));
const CorrelationView = lazy(() => import('@/components/CorrelationView').then((m) => ({ default: m.CorrelationView })));
const RANGES: Range[] = ['day', '7d', '30d', '90d', '6m', '1y'];
const RANGE_DAYS: Record<Range, number> = { day: 1, '7d': 7, '30d': 30, '90d': 90, '6m': 182, '1y': 365 };
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const today = (now: number) => new Date(now).toLocaleDateString('en-CA');
const fmt = (n: number | null, digits = 1) => (n === null ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: digits }));
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
/** Tag mit Jahr (`TT.MM.JJJJ`) — für Zeiträume, die nicht eindeutig im laufenden Jahr liegen. */
const longDay = (day: string) => `${shortDay(day)}${day.slice(0, 4)}`;
/** Mindestweg (px) für eine Wisch-Geste, die den Zeitraum verschiebt (Spec 06 „Touch"). */
const SWIPE_PX = 60;

export function AnalysisPage() {
  const { diary, now } = useData();
  const scope = useDiaryScope(true);
  const entries = useQuery(async () => ({ count: (await diary.listAllEntries()).length, diaryIds: (await diary.listDiaries()).map((d) => d.id) }), [diary]);
  const [pickedView, setView] = useState<View>('trend');
  const trainingAny = useWorker((c) => c.training({ ...(scope.diaryId ? { spec: { diaryIds: [scope.diaryId], range: { preset: 'all' as const } } } : {}), now: now() }), [scope.diaryId]);
  const views = trainingAny && trainingAny.totalDays > 0 ? VIEWS_WITH_TRAINING : VIEWS;
  const view = views.includes(pickedView) ? pickedView : 'trend';
  const [tabsApi, setTabsApi] = useState<CarouselApi>();
  // Der aktive Tab scrollt ins Bild (P6): Schnappposition suchen, die ihn enthält.
  useEffect(() => {
    if (!tabsApi) return;
    const snap = tabsApi.internalEngine().slideRegistry.findIndex((slides) => slides.includes(views.indexOf(view)));
    if (snap >= 0 && snap !== tabsApi.selectedScrollSnap()) tabsApi.scrollTo(snap);
  }, [tabsApi, view, views]);
  const [range, setRange] = useState<Range>('30d');
  /** Wie viele Zeiträume zurück (0 = bis heute); Wischen nach rechts = älter, nach links = neuer. */
  const [shift, setShift] = useState(0);
  const viewRef = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [chartEntryOpen, setChartEntryOpen] = useState(false);

  if (entries.status === 'error') return (<><PageHeader title={deAnalysis.title} sync /><ErrorState onRetry={entries.retry} /></>);
  if (entries.status === 'loading') return (<><PageHeader title={deAnalysis.title} sync /><p className="text-muted-foreground">{de.app.loading}</p></>);
  if (entries.data.count === 0) return (<><PageHeader title={deAnalysis.title} sync /><EmptyState title={deAnalysis.emptyTitle} hint={deAnalysis.emptyHint} /></>);
  const to = addDays(today(now()), -shift * RANGE_DAYS[range]);
  const from = addDays(to, -(RANGE_DAYS[range] - 1));
  const older = () => setShift((s) => s + 1);
  const newer = () => setShift((s) => Math.max(0, s - 1));
  const diaryIds = scope.diaryId ? [scope.diaryId] : entries.data.diaryIds;
  const spec: FilterSpec = { diaryIds, range: { from, to } };

  // Kalender und Dashboards haben eigene Zeiträume (Monat bzw. je Widget)
  const ownRange = view === 'calendar' || view === 'dashboards';
  const period = ownRange ? '' : range === 'day' ? ` · ${longDay(to)}` : ` · ${shortDay(from)}–${shortDay(to)}${to.slice(0, 4)}`;
  const viewTitle = `${deAnalysis.viewNames[view]}${period}`;

  async function exportPng() {
    if (!viewRef.current) return;
    setExporting(true);
    try {
      await exportViewAsPng(viewRef.current, viewTitle, deAnalysis.pngFileName(view, to));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader title={deAnalysis.title} sync />
      <Carousel setApi={setTabsApi} opts={{ dragFree: false }}>
        <CarouselContent role="group" aria-label={deAnalysis.views} className="-ml-1">
          {views.map((v) => (
            <CarouselItem key={v} className="basis-auto pl-1">
              <ToggleGroupItem pressed={view === v} onClick={() => setView(v)} className="h-11 w-24 flex-none border px-1 text-xs">
                {deAnalysis.viewNames[v]}
              </ToggleGroupItem>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselDots className="-mt-1" />
      </Carousel>
      {!ownRange ? (
        <ToggleGroup aria-label={de.history.range} data-tour="analysis-range" className={TOUR_RING}>
          {RANGES.map((r) => (
            <ToggleGroupItem key={r} pressed={range === r} onClick={() => (setRange(r), setShift(0))}>
              {deAnalysis.ranges[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      {!ownRange ? (
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" aria-label={deAnalysis.olderPeriod} onClick={older}>‹</Button>
          <span data-testid="analysis-period" className="text-sm tabular-nums">{range === 'day' ? longDay(to) : `${longDay(from)} – ${longDay(to)}`}</span>
          <Button size="sm" variant="ghost" aria-label={deAnalysis.newerPeriod} disabled={shift === 0} onClick={newer}>›</Button>
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setChartEntryOpen(true)}>
          <FilePlus aria-hidden />
          {deAnalysis.chartEntry.open}
        </Button>
        <Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportPng()}>
          <ImageDown aria-hidden />
          {deAnalysis.exportPng}
        </Button>
      </div>
      <ChartEntryDialog
        open={chartEntryOpen} diaryIds={diaryIds} defaultCaption={viewTitle} onClose={() => setChartEntryOpen(false)}
        render={() => (viewRef.current ? renderViewAsPng(viewRef.current, viewTitle) : Promise.reject(new Error('Ansicht fehlt')))}
      />
      <section
        ref={viewRef}
        data-testid={`analysis-view-${view}`}
        data-tour="analysis-charts"
        className={cn('flex touch-pan-y flex-col gap-3', TOUR_RING)}
        onPointerDown={(e) => (swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || ownRange) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y) * 2) (dx > 0 ? older : newer)();
        }}
        onPointerCancel={() => (swipe.current = null)}
      >
        {view === 'trend' ? <TrendView spec={spec} intraday={range === 'day'} /> : null}
        {view === 'calendar' ? <CalendarView diaryIds={diaryIds} /> : null}
        {view === 'meds' ? <MedsView spec={spec} /> : null}
        {view === 'freq' ? <FreqView spec={spec} from={from} to={to} /> : null}
        {view === 'body' ? <BodyView spec={spec} /> : null}
        {view === 'corr' ? <Suspense fallback={<p className="text-muted-foreground">{de.app.loading}</p>}><CorrelationView spec={spec} /></Suspense> : null}
        {view === 'training' ? <TrainingView spec={spec} /> : null}
        {view === 'dashboards' ? <Suspense fallback={<p className="text-muted-foreground">{de.app.loading}</p>}><DashboardsView /></Suspense> : null}
      </section>
      {!ownRange ? <CompareCard diaryIds={diaryIds} from={from} to={to} /> : null}
    </>
  );
}

export function TrendView({ spec, intraday, blockId: initialBlockId }: { spec: FilterSpec; intraday: boolean; blockId?: string }) {
  const { now } = useData();
  const key = JSON.stringify(spec);
  const blocks = useWorker((c) => c.blocks(), []);
  const numeric = (blocks ?? []).filter((b) => b.type === 'slider');
  const [picked, setPicked] = useState<string | undefined>(initialBlockId);
  const blockId = picked ?? numeric.find((b) => b.role === 'outcome')?.blockId ?? numeric[0]?.blockId;
  const series = useWorker((c) => (blockId ? c.dailySeries({ blockId }, { spec, now: now() }) : Promise.resolve([])), [key, blockId]);
  const points = useWorker((c) => (intraday && blockId ? c.entrySeries({ blockId }, { spec, now: now() }) : Promise.resolve([])), [key, blockId, intraday]);
  const events = useWorker((c) => c.events({ spec, now: now() }), [key]);
  if (intraday) return <IntradayCard label={numeric.find((b) => b.blockId === blockId)?.label ?? ''} points={points} numeric={numeric} blockId={blockId} onPick={setPicked} events={events ?? []} />;
  if (!series) return <p className="text-muted-foreground">{de.app.loading}</p>;
  const label = numeric.find((b) => b.blockId === blockId)?.label ?? '';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{deAnalysis.trendTitle(label)}</CardTitle>
        <p className="text-xs text-muted-foreground" data-testid="trend-n">{deAnalysis.nDays(series.length)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <BlockPicker blocks={numeric} value={blockId} onChange={setPicked} />
        {series.length === 0 ? <p className="text-sm text-muted-foreground">{deAnalysis.noValues}</p> : (
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
              <li key={i}>{`◆ ${shortDay(ev.day)} ${ev.category === 'doctor' ? deAnalysis.doctor : deAnalysis.event}: ${ev.title}`}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Zeitraum „Tag" (ANA-17): Einzelwerte über der Uhrzeit, keine Tagesaggregation. */
function IntradayCard({ label, points, numeric, blockId, onPick, events }: { label: string; points: { entryId: string; at: string; value: number }[] | null; numeric: { blockId: string; label: string; templateName: string }[]; blockId: string | undefined; onPick: (id: string) => void; events: { day: string; category: string; title: string }[] }) {
  if (!points) return <p className="text-muted-foreground">{de.app.loading}</p>;
  const clock = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const data = points.map((p) => {
    const d = new Date(p.at);
    return { hour: d.getHours() + d.getMinutes() / 60, value: p.value };
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{deAnalysis.trendTitleDay(label)}</CardTitle>
        <p className="text-xs text-muted-foreground" data-testid="trend-n">{deAnalysis.nValues(points.length)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <BlockPicker blocks={numeric} value={blockId} onChange={onPick} />
        {points.length === 0 ? <p className="text-sm text-muted-foreground">{deAnalysis.noValues}</p> : (
          <ChartContainer config={{ value: { label, color: 'var(--chart-1)' } }}>
            <LineChart data={data} margin={{ left: -20, right: 8, top: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis type="number" dataKey="hour" domain={[0, 24]} ticks={[0, 4, 8, 12, 16, 20, 24]} tickFormatter={(h: number) => clock(h)} tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltipContent />} labelFormatter={(h) => clock(Number(h))} />
              <Line dataKey="value" name={label} type="linear" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        )}
        {events.length ? (
          <ul data-testid="event-marks" className="flex flex-col gap-1 text-xs text-muted-foreground">
            {events.map((ev, i) => (
              <li key={i}>{`◆ ${ev.category === 'doctor' ? deAnalysis.doctor : deAnalysis.event}: ${ev.title}`}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CalendarView({ diaryIds }: { diaryIds: string[] }) {
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
        <Button size="sm" variant="ghost" aria-label={deAnalysis.prevMonth} onClick={() => setOffset(offset - 1)}>‹</Button>
        <CardTitle className="text-base">{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</CardTitle>
        <Button size="sm" variant="ghost" aria-label={deAnalysis.nextMonth} onClick={() => setOffset(offset + 1)}>›</Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">{outcome ? deAnalysis.calendarHint(outcome.label) : deAnalysis.noValues}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-xs" data-testid="calendar-grid">
          {deAnalysis.weekdays.map((w) => (
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
                title={v === undefined ? `${shortDay(day)} ${deAnalysis.noEntry}` : `${shortDay(day)}: ${fmt(v)}`}
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

export function MedsView({ spec }: { spec: FilterSpec }) {
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
        <CardTitle className="text-base">{deAnalysis.medicationDays}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{deAnalysis.noMedication}</p> : (
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
          <Label htmlFor="med-marker" className="font-normal">{deAnalysis.markerLine}</Label>
          <Input id="med-marker" type="number" min={0} inputMode="numeric" className="w-24" value={marker} onChange={(e) => setMarker(e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

export function FreqView({ spec, from, to }: { spec: FilterSpec; from: string; to: string }) {
  const { now } = useData();
  const blocks = useWorker((c) => c.blocks(), []);
  const choice = (blocks ?? []).filter((b) => b.type === 'multiselect' || b.type === 'checkbox');
  const [picked, setPicked] = useState<string>();
  const blockId = picked ?? choice[0]?.blockId;
  const days = useWorker((c) => (blockId ? c.optionDays({ blockId }, { from, to }, { spec, now: now() }) : Promise.resolve([])), [JSON.stringify(spec), blockId]);
  const meds = useWorker((c) => c.optionDays({ role: 'medication' }, { from, to }, { spec, now: now() }), [JSON.stringify(spec), from, to]);
  if (!days) return <p className="text-muted-foreground">{de.app.loading}</p>;
  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{deAnalysis.frequencies}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <BlockPicker blocks={choice} value={blockId} onChange={setPicked} />
        {days.length === 0 ? <p className="text-sm text-muted-foreground">{deAnalysis.noValues}</p> : (
          <ChartContainer config={{ days: { label: deAnalysis.daysLabel, color: 'var(--chart-2)' } }} className={days.length <= 4 ? 'h-40' : days.length <= 7 ? 'h-64' : 'h-96'}>
            <BarChart data={days.map((d) => ({ label: d.label, days: d.days }))} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltipContent />} />
              <Bar dataKey="days" name={deAnalysis.daysLabel} fill="var(--color-days)" radius={4} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
    {meds && meds.length > 0 ? <MedPie meds={meds} /> : null}
    </>
  );
}

/** Kreisdiagramm „Medikamente“ (ANA-23): Anteil je Medikament an den Einnahme-Tagen im Zeitraum. */
function MedPie({ meds }: { meds: { optionId: string; label: string; days: number }[] }) {
  const total = meds.reduce((s, m) => s + m.days, 0);
  const pct = (n: number) => `${Math.round((n / total) * 100)} %`;
  return (
    <Card data-testid="med-pie">
      <CardHeader>
        <CardTitle className="text-base">{deAnalysis.medicationShare}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ChartContainer config={Object.fromEntries(meds.map((m, i) => [`m${i}`, { label: m.label, color: PALETTE[i % PALETTE.length]! }]))} className="h-56">
          <PieChart>
            <Tooltip content={<ChartTooltipContent formatter={(v) => `${v} ${deAnalysis.daysLabel}`} />} />
            <Pie data={meds.map((m) => ({ name: m.label, value: m.days }))} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} isAnimationActive={false}>
              {meds.map((m, i) => <Cell key={m.optionId} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul data-testid="med-pie-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {meds.map((m, i) => (
            <li key={m.optionId} className="flex items-center gap-2">
              <svg aria-hidden className="size-3" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill={PALETTE[i % PALETTE.length]} /></svg>
              {m.label}: {pct(m.days)} ({m.days} {deAnalysis.daysLabel})
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** „Übungen“ (ANA-25): Wochenbalken (Tage mit erledigten Übungen) und Stufenverlauf je Übung — rein beschreibend. */
function TrainingView({ spec }: { spec: FilterSpec }) {
  const { now } = useData();
  const stats = useWorker((c) => c.training({ spec, now: now() }), [JSON.stringify(spec)]);
  if (!stats) return <p className="text-muted-foreground">{de.app.loading}</p>;
  const t = deAnalysis.training;
  if (stats.totalDays === 0) return <p className="text-sm text-muted-foreground">{t.noData}</p>;
  return (
    <>
      <Card data-testid="training-weeks">
        <CardHeader>
          <CardTitle className="text-base">{t.weeksTitle}</CardTitle>
          <p className="text-xs text-muted-foreground">{t.totalDays(stats.totalDays)}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ChartContainer config={{ days: { label: deAnalysis.daysLabel, color: 'var(--chart-2)' } }}>
            <BarChart data={stats.weeks.map((w) => ({ week: shortDay(w.weekStart), days: w.days }))} margin={{ left: -20, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} domain={[0, 7]} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltipContent />} />
              <Bar dataKey="days" name={deAnalysis.daysLabel} fill="var(--color-days)" radius={4} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
          <ul data-testid="training-week-list" className="sr-only">
            {stats.weeks.map((w) => (
              <li key={w.weekStart}>
                {t.weekOf(longDay(w.weekStart))}: {t.weekDays(w.days)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {stats.levels.length === 0 ? <p className="text-sm text-muted-foreground">{t.noLevels}</p> : null}
      {stats.levels.map((l) => {
        const names = new Map(l.points.map((p) => [p.levelIndex, p.levelLabel]));
        const ticks = [...names.keys()].sort((a, b) => a - b);
        return (
          <Card key={l.blockId} data-testid="training-levels">
            <CardHeader>
              <CardTitle className="text-base">{t.levelsTitle(l.label)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ChartContainer config={{ level: { label: l.label, color: 'var(--chart-1)' } }} className="h-40">
                <LineChart data={l.points.map((p) => ({ day: shortDay(p.day), level: p.levelIndex }))} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis ticks={ticks} domain={[Math.min(...ticks), Math.max(...ticks)]} tickFormatter={(i: number) => names.get(i) ?? ''} width={70} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltipContent formatter={(v) => names.get(Number(v)) ?? String(v)} />} />
                  <Line type="stepAfter" dataKey="level" name={l.label} stroke="var(--color-level)" dot isAnimationActive={false} />
                </LineChart>
              </ChartContainer>
              <ul data-testid="training-level-points" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {l.points.map((p) => (
                  <li key={p.day}>{t.levelPoint(longDay(p.day), p.levelLabel)}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

export function BodyView({ spec }: { spec: FilterSpec }) {
  const { now, diary } = useData();
  const overview = useWorker((c) => c.bodymap({ spec, now: now() }), [JSON.stringify(spec)]);
  const own = useQuery(async () => (await Promise.all(spec.diaryIds.map((d) => diary.listBodymapImages(d)))).flat(), [diary, spec.diaryIds.join()]);
  if (!overview) return <p className="text-muted-foreground">{de.app.loading}</p>;
  if (overview.length === 0) return <p className="text-sm text-muted-foreground">{deAnalysis.noValues}</p>;
  const srcOf = (id: string) => BODYMAP_PRESETS.find((p) => p.id === id)?.src ?? (own.status === 'ok' ? own.data.find((i) => i.id === id)?.dataUrl : undefined);
  const nameOf = (id: string) => deBodymap.presets[id as keyof typeof deBodymap.presets] ?? (own.status === 'ok' ? own.data.find((i) => i.id === id)?.name : undefined) ?? id;
  return (
    <>
      {overview.map((o) => (
        <Card key={o.presetId}>
          <CardHeader>
            <CardTitle className="text-base">{nameOf(o.presetId)}</CardTitle>
            <p className="text-xs text-muted-foreground">{deAnalysis.bodymapCount(o.entries, o.points.length)}</p>
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
    [deAnalysis.count, cmp.b.n, cmp.a.n, cmp.b.n - cmp.a.n],
    [deAnalysis.mean, cmp.b.mean, cmp.a.mean, cmp.diff.mean],
    [deAnalysis.median, cmp.b.median, cmp.a.median, cmp.diff.median],
    [deAnalysis.min, cmp.b.min, cmp.a.min, cmp.diff.min],
    [deAnalysis.max, cmp.b.max, cmp.a.max, cmp.diff.max],
    [deAnalysis.daysAtOrAbove, cmp.b.daysAtOrAbove, cmp.a.daysAtOrAbove, cmp.diff.daysAtOrAbove],
    [deAnalysis.daysWithEntry, cmp.b.daysWithEntry, cmp.a.daysWithEntry, cmp.b.daysWithEntry - cmp.a.daysWithEntry],
  ];
  const sign = (v: number | null) => (v === null ? '–' : `${v > 0 ? '+' : ''}${fmt(v)}`);
  return (
    <Card data-testid="compare-card">
      <CardHeader>
        <CardTitle className="text-base">{deAnalysis.compareTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">{deAnalysis.compareRanges(longDay(from), longDay(to), longDay(prev.from), longDay(prev.to))}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-sm">
          <span />
          <span className="text-right text-xs text-muted-foreground">{deAnalysis.currentPeriod}</span>
          <span className="text-right text-xs text-muted-foreground">{deAnalysis.previousPeriod}</span>
          <span className="text-right text-xs text-muted-foreground">{deAnalysis.difference}</span>
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
          <Label htmlFor="compare-threshold" className="font-normal">{deAnalysis.threshold}</Label>
          <Input id="compare-threshold" type="number" min={0} inputMode="numeric" className="w-20" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
        {cmp.fewData ? <p role="note" data-testid="few-data" className="text-sm text-muted-foreground">{deAnalysis.fewData}</p> : null}
        <p className="text-xs text-muted-foreground">{deAnalysis.descriptiveOnly}</p>
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

