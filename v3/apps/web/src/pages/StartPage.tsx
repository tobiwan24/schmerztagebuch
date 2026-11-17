import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { Link } from 'react-router';
import { Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { EntryListState } from '@/components/EntryListState';
import { BackupReminder } from '@/components/BackupReminder';
import { ConflictBanner } from '@/components/ConflictBanner';
import { RuleBanner } from '@/components/RuleBanner';
import { TemplateTiles } from '@/components/TemplateTiles';
import { InboxCard } from '@/components/InboxCard';
import { useWritableDiaries } from '@/data/useSharing';
import { de } from '@/i18n/de';

// Selten sichtbare Hinweise werden erst bei Bedarf geladen (QA-02, Bundle-Budget).
const InstallBanner = lazy(() => import('@/components/InstallBanner').then((m) => ({ default: m.InstallBanner })));
const CloudSyncBanner = lazy(() => import('@/components/CloudSyncBanner').then((m) => ({ default: m.CloudSyncBanner })));
const V2Banner = lazy(() => import('@/components/V2DataCard').then((m) => ({ default: m.V2Banner })));
const RestoreBackupBanner = lazy(() => import('@/components/RestoreBackupBanner').then((m) => ({ default: m.RestoreBackupBanner })));

export function StartPage() {
  const writable = useWritableDiaries();
  // Je beschreibbarem Tagebuch ein Schnelleintrag-Knopf (A-041); mit einem Tagebuch der gewohnte eine Knopf.
  const quick = writable.status === 'ok' && writable.data.length > 1 ? writable.data.map((d) => ({ to: `/quick?diary=${d.id}`, label: de.start.quickEntryFor(d.name) })) : [{ to: '/quick', label: de.start.quickEntry }];
  return (
    <>
      <PageHeader title={de.start.title} />
      <ConflictBanner />
      <RuleBanner />
      <Suspense fallback={null}>
        <InstallBanner />
        <V2Banner />
        <RestoreBackupBanner />
        <CloudSyncBanner />
      </Suspense>
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
