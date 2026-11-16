// Kurzanleitung unten im Bild mit Hervorhebung des Ziels (UI-29, A-082). Nicht modal: Die Seite bleibt bedienbar.
// Tastatur: Fokus startet auf „Weiter“, Esc überspringt die Seite.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { TOUR_STEPS } from './steps';
import { markPageDone, readTourState, resolveSteps, skipAllPages, writeTourState, type TourPage, type TourStep } from './tour';
import { de } from '@/i18n/de';

const t = de.tour;
const targetEl = (target: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

/** Schritte der Seite, deren Ziel im DOM steht; beobachtet Änderungen, weil Ziele asynchron erscheinen (Daten laden). */
function useSteps(page: TourPage): TourStep[] {
  const [steps, setSteps] = useState<TourStep[]>([]);
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const next = resolveSteps(TOUR_STEPS, page, (target) => targetEl(target) !== null);
      setSteps((prev) => (prev.map((s) => s.id).join() === next.map((s) => s.id).join() ? prev : next));
    };
    update();
    const observer = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [page]);
  return steps;
}

export default function TourCard({ page, onChange }: { page: TourPage; onChange: () => void }) {
  const steps = useSteps(page);
  const [index, setIndex] = useState(0);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];

  const finish = (all: boolean) => {
    const s = readTourState();
    writeTourState(all ? skipAllPages(s) : markPageDone(s, page));
    onChange();
  };

  // Ziel hervorheben und ins Bild holen.
  useEffect(() => {
    if (!step) return;
    const el = targetEl(step.target);
    if (!el) return;
    el.setAttribute('data-tour-active', '');
    el.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    return () => el.removeAttribute('data-tour-active');
  }, [step]);

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [step?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!step) return null;
  const text = t.steps[step.id]!;
  const last = index >= steps.length - 1;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-md px-4">
      <Card role="region" aria-label={t.cardLabel} data-testid="tour-card" className="pointer-events-auto gap-3 py-4 shadow-lg">
        <CardHeader>
          <p className="text-xs text-muted-foreground">{t.progress(index + 1, steps.length)}</p>
          <CardTitle>{text.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{text.body}</CardContent>
        <CardFooter className="flex-wrap justify-between gap-2">
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => finish(false)}>
              {t.skip}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => finish(true)}>
              {t.skipAll}
            </Button>
          </div>
          <Button ref={nextRef} type="button" size="sm" onClick={() => (last ? finish(false) : setIndex(index + 1))}>
            {last ? t.done : t.next}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
