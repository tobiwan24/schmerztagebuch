// Leer- und Fehlerzustand jeder Ansicht (Spec 10: keine Sackgassen, UI-05).
import { AlertTriangle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { de } from '@/i18n/de';

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <Card data-testid="empty-state" className="border-dashed text-center">
      <CardHeader className="justify-items-center">
        <Inbox className="size-6 text-muted-foreground" aria-hidden />
        <CardTitle>{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function ErrorState({ onRetry, detail }: { onRetry?: () => void; detail?: string }) {
  return (
    <Card data-testid="error-state" role="alert" className="border-destructive/50">
      <CardHeader>
        <AlertTriangle className="size-6 text-destructive" aria-hidden />
        <CardTitle>{de.state.errorTitle}</CardTitle>
        <CardDescription>{detail ?? de.state.errorHint}</CardDescription>
      </CardHeader>
      {onRetry ? (
        <CardContent>
          <Button variant="outline" onClick={onRetry}>
            {de.state.retry}
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
