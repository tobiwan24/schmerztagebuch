// Einstellungen → Über → Diagnose (Spec 10, UI-09): Version, Sync-Status, Outbox, Speicher. Keine Eintragsinhalte.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReleaseList } from '@/components/ReleaseList';
import { changelog } from '@/data/changelog';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { useDiagnostics } from '@/data/useDiagnostics';
import { useSync } from '@/data/SyncContext';
import { deWhatsNew } from '@/i18n/lazy/whatsNew';
import { deDiagnostics } from '@/i18n/lazy/diagnostics';

const t = deDiagnostics;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

export function DiagnosticsPage() {
  const d = useDiagnostics();
  const sync = useSync();
  return (
    <>
      <PageHeader title={t.title} back />
      {d.status === 'error' ? <ErrorState onRetry={d.retry} /> : null}
      {d.status === 'ok' ? (
        <Card data-testid="diagnostics">
          <CardHeader>
            <CardTitle className="text-base">{t.app}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t.version}</dt>
              <dd data-testid="diag-version" className="tabular-nums">{d.data.version}</dd>
              <dt className="text-muted-foreground">{t.mode}</dt>
              <dd>{t.modes[d.data.accountMode as keyof typeof t.modes] ?? d.data.accountMode}</dd>
              <dt className="text-muted-foreground">{t.sync}</dt>
              <dd data-testid="diag-sync">{t.syncStates[sync.state]}</dd>
              <dt className="text-muted-foreground">{t.outbox}</dt>
              <dd data-testid="diag-outbox" className="tabular-nums">{d.data.outbox}{d.data.outboxErrors ? ` (${t.outboxErrors(d.data.outboxErrors)})` : ''}</dd>
              <dt className="text-muted-foreground">{t.blobOutbox}</dt>
              <dd className="tabular-nums">{d.data.blobOutbox}</dd>
              <dt className="text-muted-foreground">{t.storage}</dt>
              <dd className="tabular-nums">{d.data.storage ? `${mb(d.data.storage.usage)} / ${mb(d.data.storage.quota)}` : t.unknown}</dd>
              <dt className="text-muted-foreground">{t.persisted}</dt>
              <dd>{d.data.persisted === null ? t.unknown : d.data.persisted ? t.yes : t.no}</dd>
              <dt className="text-muted-foreground">{t.serviceWorker}</dt>
              <dd>{t.swStates[d.data.serviceWorker]}</dd>
              {d.data.records.map((r) => (
                <div key={r.kind} className="contents">
                  <dt className="text-muted-foreground">{t.records(r.kind)}</dt>
                  <dd className="tabular-nums">{r.count}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{deWhatsNew.heading}</CardTitle>
        </CardHeader>
        <CardContent>
          {changelog.length === 0 ? <p className="text-sm text-muted-foreground">{deWhatsNew.empty}</p> : <ReleaseList releases={changelog} testId="whats-new-list" />}
        </CardContent>
      </Card>
      <Button variant="outline" onClick={d.retry}>
        {t.refresh}
      </Button>
    </>
  );
}
