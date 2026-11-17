// Start-Hinweis „3 neue Einträge von X“ (SHR-15): Tippen öffnet den nach dem Autor gefilterten Verlauf, „Ausblenden“ bestätigt ohne Sprung.
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useDiaryScope } from '@/data/diary-scope';
import { useNewEntries } from '@/data/useNewEntries';
import { de } from '@/i18n/de';

export function NewEntriesNotice() {
  const { items, markSeen } = useNewEntries();
  const scope = useDiaryScope(false);
  if (!items.length) return null;
  return (
    <>
      {items.map((i) => (
        <div key={`${i.diaryId}:${i.authorId}`} role="status" data-testid="new-entries-notice" className="flex items-center justify-between gap-2 rounded-lg border bg-accent px-4 py-3 text-sm">
          <Link
            to="/history"
            state={{ authorId: i.authorId }}
            className="flex-1 font-medium underline-offset-4 hover:underline"
            onClick={() => {
              scope.select(i.diaryId);
              void markSeen(i.diaryId);
            }}
          >
            {de.start.newEntriesFrom(i.count, i.name || de.start.unknownMember)}
          </Link>
          <Button size="sm" variant="outline" onClick={() => void markSeen(i.diaryId)}>
            {de.start.newEntriesDismiss}
          </Button>
        </div>
      ))}
    </>
  );
}
