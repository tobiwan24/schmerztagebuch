import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { Link } from 'react-router';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { BackupReminder } from '@/components/BackupReminder';
import { ConflictBanner } from '@/components/ConflictBanner';
import { RuleBanner } from '@/components/RuleBanner';
import { TemplateTiles } from '@/components/TemplateTiles';
import { InboxCard } from '@/components/InboxCard';
import { useWritableDiaries } from '@/data/useSharing';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { quickButtons } from '@/lib/quick-buttons';
import { de } from '@/i18n/de';

// Selten sichtbare Hinweise werden erst bei Bedarf geladen (QA-02, Bundle-Budget).
const InstallBanner = lazy(() => import('@/components/InstallBanner').then((m) => ({ default: m.InstallBanner })));
const CloudSyncBanner = lazy(() => import('@/components/CloudSyncBanner').then((m) => ({ default: m.CloudSyncBanner })));
const V2Banner = lazy(() => import('@/components/V2DataCard').then((m) => ({ default: m.V2Banner })));
const NewEntriesNotice = lazy(() => import('@/components/NewEntriesNotice').then((m) => ({ default: m.NewEntriesNotice })));
const RestoreBackupBanner = lazy(() => import('@/components/RestoreBackupBanner').then((m) => ({ default: m.RestoreBackupBanner })));

export function StartPage() {
  const writable = useWritableDiaries();
  const { diary } = useData();
  const templates = useQuery(() => diary.listAllTemplates(), [diary]);
  // Je ausgewählter Vorlage (Tagebuch-Einstellungen) ein Knopf; sonst je beschreibbarem Tagebuch einer (A-041, A-133).
  const quick = quickButtons(writable.status === 'ok' ? writable.data : [], templates.status === 'ok' ? templates.data : []);
  return (
    <>
      <PageHeader title={de.start.title} sync />
      <ConflictBanner />
      <RuleBanner />
      <Suspense fallback={null}>
        <NewEntriesNotice />
      </Suspense>
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
    </>
  );
}
