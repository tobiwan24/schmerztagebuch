// Arzt-Link-Ansicht `/r/:id#k=…` (Spec 07, M18): öffentlich, nur lesend, ohne Anmeldung, ohne Daten- und Sync-Module.
// Die Seite wird beim Start direkt gerendert (main.tsx), ohne AuthProvider/DataProvider/SyncProvider, und lädt den
// Chiffretext per `fetch` (Referrer-Policy no-referrer). Der Schlüssel aus dem Fragment verlässt den Browser nie.
import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { parseReportKey } from '@stb/crypto';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { de } from '@/i18n/de';
import { openReportLink, reportIdFromPath, ReportLinkError } from '@/sharing/report-link';
import { pdfBytes, type ReportPackage } from '@/sharing/report-package';

const t = de.reportViewer;
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const longDay = (day: string) => `${shortDay(day)}${day.slice(0, 4)}`;
const fmt = (n: number | null) => (n === null ? '–' : String(Math.round(n * 10) / 10).replace('.', ','));

type State =
  | { status: 'loading' }
  | { status: 'error'; code: keyof typeof t.errors }
  | { status: 'ok'; pkg: ReportPackage; expiresAt: number; viewsLeft: number };

function downloadPdf(pkg: ReportPackage): void {
  const url = URL.createObjectURL(new Blob([pdfBytes(pkg)], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = t.pdfName(pkg.report.createdAt.slice(0, 10));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function ReportViewerPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    const id = reportIdFromPath(window.location.pathname);
    const key = parseReportKey(window.location.hash);
    const fail = (code: keyof typeof t.errors) => !cancelled && setState({ status: 'error', code });
    if (!id) return void fail('not-found');
    if (!key) return void fail('no-key');
    openReportLink(id, key).then(
      (r) => !cancelled && setState({ status: 'ok', ...r }),
      (e: unknown) => fail(e instanceof ReportLinkError && e.code in t.errors ? (e.code as keyof typeof t.errors) : 'failed'),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-4" data-testid="report-viewer">
      {state.status === 'loading' ? <p role="status" className="text-muted-foreground">{t.loading}</p> : null}
      {state.status === 'error' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.errorTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p role="alert" data-testid="report-error">{t.errors[state.code]}</p>
          </CardContent>
        </Card>
      ) : null}
      {state.status === 'ok' ? <Report pkg={state.pkg} expiresAt={state.expiresAt} viewsLeft={state.viewsLeft} /> : null}
    </main>
  );
}

function Report({ pkg, expiresAt, viewsLeft }: { pkg: ReportPackage; expiresAt: number; viewsLeft: number }) {
  const r = pkg.report;
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{r.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t.period(longDay(r.from), longDay(r.to))} · {t.counts(r.entryCount, r.daysWithEntry, r.daysInRange)}
        </p>
        <p className="text-xs text-muted-foreground">{t.validity(new Date(expiresAt).toLocaleDateString('de-DE'), viewsLeft)}</p>
      </header>
      <div>
        <Button onClick={() => downloadPdf(pkg)}>
          <Download aria-hidden />
          {t.downloadPdf}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t.readOnly}</p>

      {r.stats.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.statsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.stat.label}</TableHead>
                  <TableHead>{t.stat.n}</TableHead>
                  <TableHead>{t.stat.mean}</TableHead>
                  <TableHead>{t.stat.median}</TableHead>
                  <TableHead>{t.stat.max}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.stats.map((s) => (
                  <TableRow key={s.blockId}>
                    <TableCell>{s.label}</TableCell>
                    <TableCell>{s.n}</TableCell>
                    <TableCell>{fmt(s.mean)}</TableCell>
                    <TableCell>{fmt(s.median)}</TableCell>
                    <TableCell>{fmt(s.max)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {r.chart && r.chart.points.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{r.chart.label}</CardTitle>
            <CardDescription>{t.chartHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ value: { label: r.chart.label, color: 'var(--chart-1)' } }} data-testid="report-chart">
              <LineChart data={r.chart.points} margin={{ left: -20, right: 8, top: 16 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDay} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltipContent />} labelFormatter={(d) => shortDay(String(d))} />
                <Line dataKey="value" name={r.chart.label} type="monotone" stroke="var(--color-value)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}

      {r.multiselects.map((m) => (
        <Card key={m.blockId}>
          <CardHeader>
            <CardTitle className="text-base">{t.frequencyTitle(m.label, m.template)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {m.options.map((o) => (
                <li key={o.label} className="flex justify-between gap-2">
                  <span>{o.label}</span>
                  <span className="tabular-nums">{t.days(o.days)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {r.medicationDays.length || r.doctorVisits.length ? (
        <Card>
          <CardContent className="flex flex-col gap-3 text-sm">
            {r.medicationDays.length ? (
              <section>
                <h2 className="font-medium">{t.medicationDays}</h2>
                <ul>
                  {r.medicationDays.map((m) => (
                    <li key={m.label}>{m.label}: {t.days(m.days)}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {r.doctorVisits.length ? (
              <section>
                <h2 className="font-medium">{t.doctorVisits}</h2>
                <ul>
                  {r.doctorVisits.map((v, i) => (
                    <li key={`${v.day}-${i}`}>{longDay(v.day)}: {v.title}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {r.tables.map((tab) => (
        <Card key={tab.template}>
          <CardHeader>
            <CardTitle className="text-base">{tab.template}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="report-table">
              <TableHeader>
                <TableRow>
                  <TableHead>{t.when}</TableHead>
                  {tab.columns.map((c, i) => (
                    <TableHead key={i}>{c.archived ? t.archivedColumn(c.label) : c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tab.rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap">{row.when}</TableCell>
                    {row.cells.map((cell, k) => (
                      <TableCell key={k}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
