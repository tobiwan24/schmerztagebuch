// Auswertung → „Meine Dashboards“ (Spec 06 „Dashboard-Baukasten“, ANA-32, A-116/A-117): eigene Dashboards aus Widgets, die
// die Standard-Ansichten wiederverwenden. Anlegen, Umbenennen, Widgets hinzufügen/verschieben/entfernen; Zustand als
// `dashboard`-Record (synchronisiert, nur der Owner schreibt). Rein beschreibend wie die Standard-Ansichten.
import { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { MIN_CORRELATION_DAYS, addDays, type FilterSpec } from '@stb/analysis';
import {
  DASHBOARD_MAX_WIDGETS, KPI_STATS, WIDGET_KINDS, addWidget, createDashboard, defaultWidgetConfig, moveWidget, removeWidget, renameDashboard, updateWidget,
  type Dashboard, type Widget, type WidgetKind,
} from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useWorker } from '@/components/AnalysisShared';
import { BodyView, CalendarView, FreqView, MedsView, TrendView } from '@/pages/AnalysisPage';
import { downloadText, useBackup } from '@/data/useBackup';
import { renderViewAsImage } from '@/lib/export-png';
import { useData } from '@/data/DataContext';
import { useDiaryScope } from '@/data/diary-scope';
import { useMembers } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';
import { deAnalysis } from '@/i18n/lazy/analysis';

const t = deAnalysis.dashboards;
const DAYS = [7, 30, 90, 182, 365] as const;
const num = (n: number, digits = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });

export function DashboardsView() {
  const { diary, stamper, newId, now } = useData();
  const scope = useDiaryScope(false);
  // Bei nur einem Tagebuch liefert der Umschalter `null` — dann gilt dieses eine.
  const diaryId = scope.diaryId ?? scope.diaries[0]?.id ?? '';
  const members = useMembers(diaryId);
  const readOnly = members.query.status === 'ok' && members.query.data.cloud && members.query.data.myRole !== 'owner';
  const list = useQuery(() => (diaryId ? diary.listDashboards(diaryId) : Promise.resolve([] as Dashboard[])), [diary, diaryId]);
  const blocks = useWorker((c) => c.blocks(), []);
  const [pickedId, setPickedId] = useState<string>();
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState<string>();
  const [kind, setKind] = useState<WidgetKind>('timeseries');
  const [error, setError] = useState<string>();
  /** Änderungen laufen nacheinander und gehen vom gespeicherten Stand aus (schnelle Folgeklicks gehen nicht verloren). */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const rootRef = useRef<HTMLDivElement>(null);
  const { exportFile } = useBackup();
  const [pdfBusy, setPdfBusy] = useState(false);
  if (list.status !== 'ok') return <p className="text-muted-foreground">{de.app.loading}</p>;
  const all = list.data;
  const current = all.find((d) => d.id === pickedId) ?? all[0];
  const numeric = (blocks ?? []).filter((b) => b.type === 'slider');

  async function stampNow() {
    const s = await stamper.stamp();
    return { hlc: s.hlc, updatedAt: s.at };
  }
  async function create() {
    if (!newName.trim() || !diaryId) return setError(t.nameRequired);
    setError(undefined);
    const d = createDashboard({ id: newId(), diaryId, name: newName }, all, await stampNow());
    await diary.saveDashboard(d);
    setPickedId(d.id);
    setNewName('');
    list.retry();
  }
  function change(fn: (d: Dashboard, stamp: { hlc: string; updatedAt: string }) => Dashboard): Promise<void> {
    if (!current) return Promise.resolve();
    const id = current.id;
    const run = async () => {
      try {
        const stored = (await diary.listDashboards(diaryId)).find((d) => d.id === id);
        if (stored) await diary.saveDashboard(fn(stored, await stampNow()));
        setError(undefined);
      } catch {
        setError(t.invalid);
      }
      list.retry();
    };
    queue.current = queue.current.then(run);
    return queue.current;
  }
  async function addKind() {
    if (kind === 'correlation' && numeric.length < 2) return setError(t.needTwo);
    const config = kind === 'correlation' ? defaultWidgetConfig(kind, { a: numeric[0]!.blockId, b: numeric[1]!.blockId }) : defaultWidgetConfig(kind);
    await change((d, s) => addWidget(d, { id: newId(), kind, config }, s));
  }
  async function remove() {
    if (!current) return;
    const s = await stampNow();
    await diary.deleteDashboard(current.id, s);
    setPickedId(undefined);
    list.retry();
  }

  /** PDF-Layout „Dashboard“ (EXP-26): das gerenderte Dashboard ersetzt das Standard-Diagramm auf Seite 1. */
  async function exportPdf() {
    if (!current || !rootRef.current) return;
    const widgets = rootRef.current.querySelector<HTMLElement>('[data-testid="dashboard-widgets"]');
    if (!widgets) return;
    setPdfBusy(true);
    try {
      const dashboardImage = await renderViewAsImage(widgets, current.name);
      const to = new Date(now()).toLocaleDateString('en-CA');
      const days = Math.max(...current.widgets.map((w) => w.config.days));
      const f = await exportFile('pdf', { layout: 'dashboard', imageSize: 'a5', dashboardImage, filter: { diaryIds: [current.diaryId], range: { from: addDays(to, -(days - 1)), to } } });
      downloadText(f.name, f.text, f.mime);
      setError(undefined);
    } catch {
      setError(t.exportPdfFailed);
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3" data-testid="dashboards-view">
      {all.length === 0 ? <p className="text-sm text-muted-foreground">{t.empty}</p> : null}
      {all.length > 0 ? (
        <div role="group" aria-label={t.list} className="flex flex-wrap gap-2">
          {all.map((d) => (
            <Button key={d.id} size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1 text-left" variant={d.id === current?.id ? 'default' : 'outline'} aria-pressed={d.id === current?.id} onClick={() => (setPickedId(d.id), setRename(undefined))}>
              {d.name}
            </Button>
          ))}
        </div>
      ) : null}
      {readOnly ? <p role="status" className="text-sm text-muted-foreground">{t.readOnly}</p> : (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <Label htmlFor="dash-new">{t.newName}</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="dash-new" className="min-w-0 flex-1" value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} />
              <Button onClick={() => void create()}>{t.create}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {current ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="min-w-0 break-words text-base font-medium" data-testid="dashboard-name">{current.name}</h2>
            {!readOnly ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setRename(current.name)}>{t.rename}</Button>
                <Button size="sm" variant="outline" onClick={() => void remove()}>{t.delete}</Button>
              </div>
            ) : null}
          </div>
          {rename !== undefined && !readOnly ? (
            <div className="flex flex-wrap gap-2">
              <Input className="min-w-0 flex-1" aria-label={t.renameLabel} value={rename} maxLength={80} onChange={(e) => setRename(e.target.value)} />
              <Button onClick={() => void change((d, s) => renameDashboard(d, rename, s)).then(() => setRename(undefined))}>{t.save}</Button>
            </div>
          ) : null}
          {current.widgets.length === 0 ? <p className="text-sm text-muted-foreground">{t.noWidgets}</p> : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="dashboard-widgets">
            {current.widgets.map((w, i) => (
              <section key={w.id} data-testid="dashboard-widget" data-kind={w.kind} className={w.span === 2 ? 'flex flex-col gap-2 md:col-span-2' : 'flex flex-col gap-2'}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium" data-widget-name>{t.kinds[w.kind]}</span>
                  {!readOnly ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Select
                        aria-label={t.daysFor(t.kinds[w.kind])} className="h-9 w-auto" value={String(w.config.days)}
                        onChange={(e) => void change((d, s) => updateWidget(d, w.id, { config: { ...w.config, days: Number(e.target.value) } }, s))}
                      >
                        {[...new Set<number>([...DAYS, w.config.days])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{t.dayOption(n)}</option>)}
                      </Select>
                      {w.kind === 'kpi' ? (
                        <Select
                          aria-label={t.statFor} className="h-9 w-auto" value={w.config.stat}
                          onChange={(e) => void change((d, s) => updateWidget(d, w.id, { config: { ...w.config, stat: e.target.value } }, s))}
                        >
                          {KPI_STATS.map((k) => <option key={k} value={k}>{t.stats[k]}</option>)}
                        </Select>
                      ) : null}
                      <Button size="sm" variant="ghost" aria-label={t.wider(t.kinds[w.kind])} aria-pressed={w.span === 2} onClick={() => void change((d, s) => updateWidget(d, w.id, { span: w.span === 2 ? 1 : 2 }, s))}>↔</Button>
                      <Button size="sm" variant="ghost" aria-label={t.up(t.kinds[w.kind])} disabled={i === 0} onClick={() => void change((d, s) => moveWidget(d, w.id, i - 1, s))}>↑</Button>
                      <Button size="sm" variant="ghost" aria-label={t.down(t.kinds[w.kind])} disabled={i === current.widgets.length - 1} onClick={() => void change((d, s) => moveWidget(d, w.id, i + 1, s))}>↓</Button>
                      <Button size="sm" variant="ghost" aria-label={t.remove(t.kinds[w.kind])} onClick={() => void change((d, s) => removeWidget(d, w.id, s))}>✕</Button>
                    </div>
                  ) : null}
                </div>
                <WidgetBody widget={w} diaryId={current.diaryId} />
              </section>
            ))}
          </div>
          {current.widgets.length > 0 ? (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" className="h-auto min-h-9 max-w-full whitespace-normal py-1 text-left" disabled={pdfBusy} onClick={() => void exportPdf()}>
                <FileText aria-hidden />
                {t.exportPdf}
              </Button>
            </div>
          ) : null}
          {!readOnly ? (
            <Card>
              <CardContent className="flex flex-col gap-2 pt-6">
                <Label htmlFor="dash-kind">{t.addWidget}</Label>
                <div className="flex flex-wrap gap-2">
                  <Select id="dash-kind" className="min-w-0 flex-1" value={kind} onChange={(e) => setKind(e.target.value as WidgetKind)}>
                    {WIDGET_KINDS.map((k) => <option key={k} value={k}>{t.kinds[k]}</option>)}
                  </Select>
                  <Button disabled={current.widgets.length >= DASHBOARD_MAX_WIDGETS} onClick={() => void addKind()}>{t.add}</Button>
                </div>
                {current.widgets.length >= DASHBOARD_MAX_WIDGETS ? <p className="text-xs text-muted-foreground">{t.max(DASHBOARD_MAX_WIDGETS)}</p> : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Zeitraum der letzten `days` Tage bis heute. */
function useSpec(diaryId: string, days: number): { spec: FilterSpec; from: string; to: string } {
  const { now } = useData();
  const to = new Date(now()).toLocaleDateString('en-CA');
  const from = addDays(to, -(days - 1));
  return { spec: { diaryIds: [diaryId], range: { from, to } }, from, to };
}

function WidgetBody({ widget, diaryId }: { widget: Widget; diaryId: string }) {
  const { spec, from, to } = useSpec(diaryId, widget.config.days);
  switch (widget.kind) {
    case 'timeseries': return <TrendView spec={spec} intraday={false} {...(widget.config.blockId ? { blockId: widget.config.blockId } : {})} />;
    case 'heatmap': return <CalendarView diaryIds={[diaryId]} />;
    case 'medicationDays': return <MedsView spec={spec} />;
    case 'frequency': return <FreqView spec={spec} from={from} to={to} />;
    case 'bodymap': return <BodyView spec={spec} />;
    case 'correlation': return <CorrelationWidget spec={spec} a={widget.config.blockIdA} b={widget.config.blockIdB} lag={widget.config.lag} />;
    case 'kpi': return <KpiWidget spec={spec} stat={widget.config.stat} {...(widget.config.blockId ? { blockId: widget.config.blockId } : {})} />;
  }
}

function CorrelationWidget({ spec, a, b, lag }: { spec: FilterSpec; a: string; b: string; lag: number }) {
  const { now } = useData();
  const c = deAnalysis.corr;
  const result = useWorker((w) => w.correlation({ blockId: a }, { blockId: b }, lag, { spec, now: now() }), [JSON.stringify(spec), a, b, lag]);
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6 text-sm">
        <p data-testid="corr-result">
          {!result ? c.loading
            : !result.enough ? c.tooFew(result.n, MIN_CORRELATION_DAYS)
            : result.rho === null || result.strength === null ? c.constant(result.n)
            : c.result(num(result.rho, 2), c.strength[result.strength], result.rho >= 0 ? c.direction.positive : c.direction.negative, result.n)}
        </p>
        <p className="text-xs text-muted-foreground">{c.caveat}</p>
      </CardContent>
    </Card>
  );
}

function KpiWidget({ spec, stat, blockId }: { spec: FilterSpec; stat: 'mean' | 'median' | 'max' | 'min'; blockId?: string }) {
  const { now } = useData();
  const target = blockId ? { blockId } : { role: 'outcome' as const };
  const series = useWorker((c) => c.dailySeries(target, { spec, now: now() }), [JSON.stringify(spec), blockId]);
  const values = (series ?? []).map((d) => d.value).sort((x, y) => x - y);
  const value = values.length === 0 ? null
    : stat === 'max' ? values[values.length - 1]!
    : stat === 'min' ? values[0]!
    : stat === 'mean' ? values.reduce((s, v) => s + v, 0) / values.length
    : values.length % 2 ? values[(values.length - 1) / 2]! : (values[values.length / 2 - 1]! + values[values.length / 2]!) / 2;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.stats[stat]}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p data-testid="kpi-value" className="text-3xl font-semibold tabular-nums">{!series ? '…' : value === null ? '–' : num(value)}</p>
        <p className="text-xs text-muted-foreground" data-testid="kpi-n">{series ? deAnalysis.nDays(values.length) : ''}</p>
      </CardContent>
    </Card>
  );
}
