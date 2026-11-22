// Eingang auf der Startseite (Spec 08/10): Kurzbefehl-Items, aus denen kein Eintrag entstehen konnte — übernehmen
// (Entwurf auf der Kurzbefehl-Seite) oder verwerfen. Nichts geht verloren (VOI-07).
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInbox } from '@/data/useShortcut';
import { de } from '@/i18n/de';

const t = de.shortcut;

export function InboxCard() {
  const { items, discard } = useInbox();
  if (items.status !== 'ok' || !items.data.length) return null;
  return (
    <Card data-testid="inbox-card">
      <CardHeader>
        <CardTitle className="text-base">{t.inboxTitle(items.data.length)}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.data.map((i) => (
          <div key={i.id} data-testid="inbox-item" className="flex flex-col gap-1 border-b pb-3 text-sm last:border-b-0 last:pb-0">
            <span>{new Date(i.receivedAt).toLocaleString('de-DE')}{i.body.text ? ` · ${i.body.text}` : ''}</span>
            <span className="text-muted-foreground">{i.problems.join(' · ')}</span>
            <div className="flex gap-2">
              <Button asChild size="sm"><Link to={`/more/diaries/${i.diaryId}/shortcut?inbox=${i.id}`}>{t.inboxTake}</Link></Button>
              <Button size="sm" variant="outline" onClick={() => void discard(i.id)}>{t.inboxDiscard}</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
