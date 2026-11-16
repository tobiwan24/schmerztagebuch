// Start: Begrüßung (Konto-Modus mit Benutzernamen) und Vorlagen-Kacheln (BLK-44). Ein Tipp öffnet das Formular mit
// dieser Vorlage. Gezeigt werden aktive Vorlagen beschreibbarer Tagebücher in Vorlagen-Reihenfolge.
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { Link } from 'react-router';
import { Dumbbell } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { isCloudAccount } from '@/auth/cloud-account';
import { loadAccount } from '@/auth/local-account';
import { useData } from '@/data/DataContext';
import { useWritableDiaries } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { TemplateIcon } from '@/components/TemplateIcon';
import { de } from '@/i18n/de';

export function TemplateTiles() {
  const { db, accountMode } = useAuth();
  const { diary } = useData();
  const writable = useWritableDiaries();
  const writableIds = writable.status === 'ok' ? writable.data.map((d) => d.id).join() : null;
  const query = useQuery(async () => {
    if (writable.status !== 'ok') return { tiles: [], username: null as string | null };
    const ids = new Set(writable.data.map((d) => d.id));
    const tiles = (await diary.listAllTemplates()).filter((t) => !t.archived && t.purpose !== 'training' && ids.has(t.diaryId));
    const account: unknown = await loadAccount(db);
    return { tiles, username: isCloudAccount(account) ? account.cloud.username : null };
  }, [db, diary, writableIds, accountMode]);
  if (query.status !== 'ok') return null;
  const { tiles, username } = query.data;
  return (
    <section data-testid="template-tiles" data-tour="start-tiles" aria-label={de.start.tilesLabel} className={cn('flex flex-col gap-2', TOUR_RING)}>
      {username ? <p data-testid="greeting" className="text-sm text-muted-foreground">{de.start.greeting(username)}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <Link
            key={t.id}
            to={`/entry/new?template=${t.id}`}
            data-testid="template-tile"
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-3 text-sm font-medium shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <TemplateIcon icon={t.icon} color={t.color} className="size-5" />
            <span className="min-w-0 flex-1 truncate">{t.name}</span>
          </Link>
        ))}
        <Link
          to="/training"
          data-testid="training-tile"
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-3 text-sm font-medium shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Dumbbell aria-hidden className="size-5" />
          <span className="min-w-0 flex-1 truncate">{de.start.trainingTile}</span>
        </Link>
      </div>
    </section>
  );
}
