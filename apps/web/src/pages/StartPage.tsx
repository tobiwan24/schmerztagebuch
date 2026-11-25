import { lazy, Suspense } from 'react';
import { QuickLink } from '@/components/QuickLink';
import { PageHeader } from '@/components/PageHeader';
import { BackupReminder } from '@/components/BackupReminder';
import { ConflictBanner } from '@/components/ConflictBanner';
import { RuleBanner } from '@/components/RuleBanner';
import { TemplateTiles } from '@/components/TemplateTiles';
import { InboxCard } from '@/components/InboxCard';
import { compareByOrder } from '@stb/core';
import { useWritableDiaries } from '@/data/useSharing';
import { useData } from '@/data/DataContext';
import { useActiveDiary } from '@/data/diary-scope';
import { useQuery } from '@/data/useQuery';
import { quickButtons } from '@/lib/quick-buttons';
import { de } from '@/i18n/de';

// Selten sichtbare Hinweise werden erst bei Bedarf geladen (QA-02, Bundle-Budget).
const InstallBanner = lazy(() => import('@/components/InstallBanner').then((m) => ({ default: m.InstallBanner })));
const CloudSyncBanner = lazy(() => import('@/components/CloudSyncBanner').then((m) => ({ default: m.CloudSyncBanner })));
const V2Banner = lazy(() => import('@/components/V2DataCard').then((m) => ({ default: m.V2Banner })));
const NewEntriesNotice = lazy(() => import('@/components/NewEntriesNotice').then((m) => ({ default: m.NewEntriesNotice })));
const QuickCarousel = lazy(() => import('@/components/QuickCarousel'));
const RestoreBackupBanner = lazy(() => import('@/components/RestoreBackupBanner').then((m) => ({ default: m.RestoreBackupBanner })));

export function StartPage() {
  const writable = useWritableDiaries();
  const { diary } = useData();
  // RDM-034 (R1, A-150): nur das gewählte Tagebuch — Kacheln und Schnell-Buttons folgen dem Umschalter.
  const active = useActiveDiary();
  const templates = useQuery(async () => (active.diaryId ? (await diary.listTemplates(active.diaryId)).sort(compareByOrder) : []), [diary, active.diaryId]);
  const activeDiary = writable.status === 'ok' ? writable.data.find((d) => d.id === active.diaryId) : undefined;
  const readOnly = writable.status === 'ok' && active.diaryId !== null && !activeDiary;
  const quick = activeDiary ? quickButtons(activeDiary, templates.status === 'ok' ? templates.data : []) : [{ to: '/quick', label: de.start.quickEntry }];
  // Erst rendern, wenn Tagebücher und Vorlagen geladen sind (kein Umspringen der Beschriftung).
  const loading = !active.ready || writable.status === 'loading' || templates.status === 'loading';
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
      {loading ? (
        <div aria-hidden className="h-16" />
      ) : readOnly ? (
        <p role="status" data-testid="start-read-only" className="text-sm text-muted-foreground">{de.start.readOnly}</p>
      ) : quick.length === 1 ? (
        <QuickLink q={quick[0]!} first />
      ) : (
        // Platzhalter = Knopf (4rem) + Punktezeile (0.75rem Abstand + 2.75rem), kein Layoutsprung beim Nachladen von embla.
        <Suspense fallback={<div aria-hidden className="h-[7.5rem]" />}>
          <QuickCarousel buttons={quick} />
        </Suspense>
      )}
      <TemplateTiles diaryId={active.diaryId} readOnly={readOnly || writable.status !== 'ok'} />
    </>
  );
}
