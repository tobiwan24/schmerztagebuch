// Einstellungen: „Tutorial erneut zeigen“ setzt die Tour zurück (UI-29).
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { resetTour, writeTourState } from './tour';
import { de } from '@/i18n/de';

const t = de.tour;

export function TourRestartCard() {
  const [done, setDone] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.heading}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t.restartHint}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            writeTourState(resetTour());
            setDone(true);
          }}
        >
          {t.restart}
        </Button>
        {done ? (
          <p role="status" data-testid="tour-restarted" className="text-sm">
            {t.restarted}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
