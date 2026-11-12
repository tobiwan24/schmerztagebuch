import { Link } from 'react-router';
import { Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EntryListState } from '@/components/EntryListState';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function StartPage() {
  const { diary } = useData();
  const entries = useQuery(() => diary.listAllEntries(), [diary]);
  return (
    <>
      <PageHeader title={de.start.title} />
      <Button asChild size="lg" className="h-16 text-base">
        <Link to="/quick">
          <Zap aria-hidden />
          {de.start.quickEntry}
        </Link>
      </Button>
      <EntryListState query={entries} emptyTitle={de.start.emptyTitle} emptyHint={de.start.emptyHint} onRetry={entries.retry} />
      <Button asChild variant="outline">
        <Link to="/entry/new">
          <Plus aria-hidden />
          {de.start.newEntry}
        </Link>
      </Button>
    </>
  );
}
