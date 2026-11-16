import { Link } from 'react-router';
import { Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EntryListState } from '@/components/EntryListState';
import { BackupReminder } from '@/components/BackupReminder';
import { V2Banner } from '@/components/V2DataCard';
import { InstallBanner } from '@/components/InstallBanner';
import { ConflictBanner } from '@/components/ConflictBanner';
import { InboxCard } from '@/components/InboxCard';
import { useWritableDiaries } from '@/data/useSharing';
import { de } from '@/i18n/de';

export function StartPage() {
  const writable = useWritableDiaries();
  // Je beschreibbarem Tagebuch ein Schnelleintrag-Knopf (A-041); mit einem Tagebuch der gewohnte eine Knopf.
  const quick = writable.status === 'ok' && writable.data.length > 1 ? writable.data.map((d) => ({ to: `/quick?diary=${d.id}`, label: de.start.quickEntryFor(d.name) })) : [{ to: '/quick', label: de.start.quickEntry }];
  return (
    <>
      <PageHeader title={de.start.title} />
      <InstallBanner />
      <ConflictBanner />
      <V2Banner />
      <InboxCard />
      <BackupReminder />
      {quick.map((q) => (
        <Button key={q.to} asChild size="lg" className="h-16 text-base">
          <Link to={q.to}>
            <Zap aria-hidden />
            {q.label}
          </Link>
        </Button>
      ))}
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
