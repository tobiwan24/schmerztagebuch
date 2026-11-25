// Start: Begrüßung (Konto-Modus mit Benutzernamen) und Vorlagen-Kacheln (BLK-44). Ein Tipp öffnet das Formular mit
// dieser Vorlage. Gezeigt werden nur aktive Eintragsvorlagen des gewählten Tagebuchs in Vorlagen-Reihenfolge (RDM-034);
// ist es nur lesbar, entfallen die Kacheln (die Kachel „Übungen“ bleibt).
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { Link } from 'react-router';
import { Dumbbell } from 'lucide-react';
import { compareByOrder } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { isCloudAccount } from '@/auth/cloud-account';
import { loadAccount } from '@/auth/local-account';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { TemplateIcon } from '@/components/TemplateIcon';
import { isEntryTemplate } from '@/lib/entry-template';
import { de } from '@/i18n/de';

export function TemplateTiles({ diaryId, readOnly }: { diaryId: string | null; readOnly: boolean }) {
  const { db, accountMode } = useAuth();
  const { diary } = useData();
  const query = useQuery(async () => {
    const tiles = diaryId && !readOnly ? (await diary.listTemplates(diaryId)).filter(isEntryTemplate).sort(compareByOrder) : [];
    const account: unknown = await loadAccount(db);
    return { tiles, username: isCloudAccount(account) ? account.cloud.username : null };
  }, [db, diary, diaryId, readOnly, accountMode]);
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
