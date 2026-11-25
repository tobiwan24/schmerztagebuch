// Einstellungen → Konfliktprotokoll (UI-18): unterlegene Werte aus dem Zusammenführen, nur auf diesem Gerät.
// Beim Öffnen gelten alle als gesehen (das Start-Banner verschwindet); „Neu" markiert die zuvor ungesehenen.
import { useEffect } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

const t = de.conflicts;
const MAX = 200;

function show(v: unknown): string {
  const text = typeof v === 'string' ? v : JSON.stringify(v) ?? '';
  return text.length > MAX ? `${text.slice(0, MAX)}…` : text;
}

export function ConflictLogPage() {
  const { conflicts } = useData();
  const list = useQuery(() => conflicts.list(), [conflicts]);
  const loaded = list.status === 'ok';
  useEffect(() => {
    if (loaded) void conflicts.markAllSeen();
  }, [loaded, conflicts]);
  return (
    <>
      <PageHeader title={t.title} back />
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      {list.status === 'error' ? <ErrorState onRetry={list.retry} /> : null}
      {list.status === 'ok' && list.data.length === 0 ? <p className="text-sm" data-testid="conflict-empty">{t.empty}</p> : null}
      {list.status === 'ok'
        ? list.data.map((c) => (
            <Card key={c.id} data-testid="conflict-row">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {t.kinds[c.kind] ?? t.kindOther}
                  {!c.seen ? <Badge>{t.unseen}</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{t.field}</dt>
                  <dd>{c.field === '*' ? t.wholeRecord : c.field}</dd>
                  <dt className="text-muted-foreground">{t.losingValue}</dt>
                  <dd className="break-words" data-testid="conflict-value">{show(c.losingValue)}</dd>
                  <dt className="text-muted-foreground">{t.resolvedAt}</dt>
                  <dd className="tabular-nums">{new Date(c.resolvedAt).toLocaleString('de-DE')}</dd>
                </dl>
                {c.kind === 'entry' ? (
                  <Button asChild size="sm" variant="outline" className="self-start">
                    <Link to={`/entry/${c.recordId}`}>{t.openEntry}</Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))
        : null}
    </>
  );
}
