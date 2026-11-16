import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { Link } from 'react-router';
import { Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EntryListState } from '@/components/EntryListState';
import { BackupReminder } from '@/components/BackupReminder';
import { V2Banner } from '@/components/V2DataCard';
import { InstallBanner } from '@/components/InstallBanner';
import { ConflictBanner } from '@/components/ConflictBanner';
import { RestoreBackupBanner } from '@/components/RestoreBackupBanner';
import { CloudSyncBanner } from '@/components/CloudSyncBanner';
import { TemplateTiles } from '@/components/TemplateTiles';
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
      <RestoreBackupBanner />
      <CloudSyncBanner />
      <InboxCard />
      <BackupReminder />
      {quick.map((q, i) => (
        <Button key={q.to} asChild size="lg" data-tour={i === 0 ? 'start-quick' : undefined} className={cn('h-16 text-base', TOUR_RING)}>
          <Link to={q.to}>
            <Zap aria-hidden />
            {q.label}
          </Link>
        </Button>
      ))}
      <TemplateTiles />
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
