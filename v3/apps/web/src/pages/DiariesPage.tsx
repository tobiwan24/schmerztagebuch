// Mehr → Tagebücher (Spec 10): Liste der Tagebücher mit Kurzbefehl (08) und Mitgliedern (09).
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/StateView';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

const t = de.diaries;

export function DiariesPage() {
  const { diary } = useData();
  const list = useQuery(() => diary.listDiaries(), [diary]);
  return (
    <>
      <PageHeader title={de.more.diaries} back />
      {list.status === 'error' ? <ErrorState onRetry={list.retry} /> : null}
      {list.status === 'ok'
        ? list.data.map((d) => (
            <Card key={d.id} data-testid="diary-card" className="gap-0 py-0">
              <p className="border-b px-4 py-3 font-medium">{d.name}</p>
              <Link to={`/more/diaries/${d.id}/members`} className="flex min-h-11 items-center justify-between border-b px-4 py-3 text-sm">
                {t.members}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
              <Link to={`/more/diaries/${d.id}/shortcut`} className="flex min-h-11 items-center justify-between px-4 py-3 text-sm">
                {t.shortcut}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </Card>
          ))
        : null}
    </>
  );
}
