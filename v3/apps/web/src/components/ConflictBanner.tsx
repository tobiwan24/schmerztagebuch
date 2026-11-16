// Start-Banner bei ungesehenen Einträgen im Konfliktprotokoll (UI-18). Öffnen des Protokolls markiert sie als gesehen.
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export function ConflictBanner() {
  const { conflicts } = useData();
  const unseen = useQuery(() => conflicts.unseenCount(), [conflicts]);
  if (unseen.status !== 'ok' || unseen.data === 0) return null;
  return (
    <div role="status" data-testid="conflict-banner" className="flex items-start justify-between gap-2 rounded-lg border bg-accent px-4 py-3 text-sm">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{de.conflicts.bannerTitle(unseen.data)}</span>
        <span>{de.conflicts.bannerHint}</span>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/more/settings/konflikte">{de.conflicts.bannerOpen}</Link>
      </Button>
    </div>
  );
}
