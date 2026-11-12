import { Link } from 'react-router';
import { Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EntryListState } from '@/components/EntryListState';
import { de } from '@/i18n/de';

export function StartPage() {
  return (
    <>
      <PageHeader title={de.start.title} />
      <Button asChild size="lg" className="h-16 text-base">
        <Link to="/quick">
          <Zap aria-hidden />
          {de.start.quickEntry}
        </Link>
      </Button>
      <EntryListState emptyTitle={de.start.emptyTitle} emptyHint={de.start.emptyHint} />
      <Button asChild variant="outline">
        <Link to="/entry/new">
          <Plus aria-hidden />
          {de.start.newEntry}
        </Link>
      </Button>
    </>
  );
}
