// Ansichten-Gerüst laut Wireframes (G1). Inhalte folgen mit den jeweiligen Meilensteinen (M8, M9, M12).
import { Link, useParams } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/StateView';
import { de } from '@/i18n/de';

export function HistoryPage() {
  return (
    <>
      <PageHeader title={de.history.title} />
      <EmptyState title={de.history.emptyTitle} hint={de.history.emptyHint} />
    </>
  );
}

export function AnalysisPage() {
  return (
    <>
      <PageHeader title={de.analysis.title} />
      <EmptyState title={de.analysis.emptyTitle} hint={de.analysis.emptyHint} />
    </>
  );
}

const MORE_LINKS = [
  { to: '/more/templates', label: de.more.templates },
  { to: '/more/diaries', label: de.more.diaries },
  { to: '/more/export', label: de.more.export },
  { to: '/more/settings', label: de.more.settings },
] as const;

export function MorePage() {
  return (
    <>
      <PageHeader title={de.more.title} />
      <Card className="gap-0 py-0">
        {MORE_LINKS.map(({ to, label }) => (
          <Link key={to} to={to} className="flex min-h-12 items-center justify-between border-b px-4 last:border-b-0">
            {label}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </Card>
    </>
  );
}

export function PlaceholderPage({ title }: { title: string }) {
  return <PageHeader title={title} back />;
}

export function EntryPage() {
  const { id } = useParams();
  return <PageHeader title={id === 'new' ? de.entry.newTitle : de.entry.title} back />;
}

export function NotFoundPage() {
  return (
    <>
      <PageHeader title={de.notFound.title} />
      <Button asChild variant="outline">
        <Link to="/">{de.notFound.toStart}</Link>
      </Button>
    </>
  );
}
