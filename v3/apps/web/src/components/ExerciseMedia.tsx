// Anzeige der Übungsmedien (RDM-033, A-149): Inhalt lokal (bzw. im Editor vorgemerkt) oder — auf einem anderen Gerät —
// vom Server, als Object-URL (CSP `media-src 'self' blob:`). Video mit Bedienelementen, Schritt-Ansicht mit Bild und Text.
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { stepImageId, stepText, type ExerciseStep } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useData } from '@/data/DataContext';
import { useSync } from '@/data/SyncContext';
import { deTraining } from '@/i18n/lazy/training';
import { useExerciseMediaDraft } from './exercise-media-draft';

const t = deTraining.media;

type MediaState = { status: 'loading' } | { status: 'ok'; url: string } | { status: 'missing' };

/** Object-URL eines Übungsmediums; wird beim Wechsel/Unmount freigegeben. */
export function useExerciseMediaUrl(id: string | undefined): MediaState {
  const { attachments } = useData();
  const sync = useSync();
  const draft = useExerciseMediaDraft();
  const [state, setState] = useState<MediaState>({ status: 'loading' });
  useEffect(() => {
    if (!id) return;
    let url: string | undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    async function load(mediaId: string) {
      const pending = draft?.pending.get(mediaId);
      const meta = pending?.meta ?? (await attachments.getExerciseMedia(mediaId));
      let bytes = pending?.bytes ?? (await attachments.data(mediaId));
      if (!bytes && meta) {
        bytes = await sync.fetchBlob(meta.diaryId, mediaId).catch(() => undefined);
        if (bytes) await attachments.storeDownloaded(mediaId, bytes);
      }
      if (cancelled) return;
      if (!bytes || !meta) return setState({ status: 'missing' });
      url = URL.createObjectURL(new Blob([bytes], { type: meta.mime }));
      setState({ status: 'ok', url });
    }
    void load(id).catch(() => !cancelled && setState({ status: 'missing' }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, attachments, sync, draft]);
  return id ? state : { status: 'missing' };
}

/** Hochgeladenes Übungsvideo zum Abspielen. */
export function ExerciseVideo({ id, label }: { id: string; label: string }) {
  const media = useExerciseMediaUrl(id);
  if (media.status === 'loading') return <p className="text-sm text-muted-foreground">{t.loading}</p>;
  if (media.status === 'missing') return <p className="text-sm text-muted-foreground" data-testid="exercise-video-missing">{t.unavailable}</p>;
  return (
    <video
      src={media.url} controls playsInline preload="metadata" aria-label={t.videoLabel(label)} data-testid="exercise-video"
      className="aspect-video w-full rounded-md bg-muted object-contain"
    />
  );
}

/** Bild eines Schritts. */
export function ExerciseStepImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const media = useExerciseMediaUrl(id);
  if (media.status === 'ok') return <img src={media.url} alt={alt} className={className} data-testid="exercise-step-image" />;
  return (
    <div className={className} role="img" aria-label={media.status === 'loading' ? t.loading : t.unavailable}>
      <div className="flex h-full min-h-24 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {media.status === 'missing' ? <ImageOff aria-hidden /> : null}
      </div>
    </div>
  );
}

/** Schritt-für-Schritt-Anleitung mit Bildern: ein Schritt je Ansicht, Vor/Zurück. */
export function ExerciseStepViewer({ steps }: { steps: readonly ExerciseStep[] }) {
  const [index, setIndex] = useState(0);
  const i = Math.min(index, steps.length - 1);
  const step = steps[i]!;
  const imageId = stepImageId(step);
  const text = stepText(step);
  return (
    <section className="flex flex-col gap-2" aria-label={deTraining.field.steps} data-testid="exercise-step-viewer">
      <h3 className="text-sm font-medium">{deTraining.field.steps}</h3>
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 p-4">
          {imageId ? <ExerciseStepImage key={imageId} id={imageId} alt={text || t.stepOf(i + 1, steps.length)} className="max-h-[50vh] w-full rounded-md object-contain" /> : null}
          <p className="text-xs text-muted-foreground" data-testid="exercise-step-count">{t.stepOf(i + 1, steps.length)}</p>
          {text ? <p className="text-sm" data-testid="exercise-step-text">{text}</p> : null}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={i === 0} onClick={() => setIndex(i - 1)}>
          <ChevronLeft aria-hidden />
          {t.prevStep}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={i === steps.length - 1} onClick={() => setIndex(i + 1)}>
          {t.nextStep}
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </section>
  );
}
