// Start-Banner „Mit Konto synchronisieren" (UI-23): nur im Modus „nur auf diesem Gerät" und mit mindestens einem Eintrag;
// wegklickbar (bleibt danach verborgen). Führt zum Wechsel in den Einstellungen.
import { Link } from 'react-router';
import { Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

const t = de.cloudBanner;
const DISMISSED = 'cloud-banner:dismissed';

export function CloudSyncBanner() {
  const { db, accountMode, status } = useAuth();
  const data = useData();
  const state = useQuery(async () => {
    const [entries, dismissed] = await Promise.all([data.diary.listAllEntries(), db.keys.get(DISMISSED)]);
    return { has: entries.length > 0, dismissed: !!dismissed };
  }, [db, data.diary]);
  if (status !== 'unlocked' || accountMode !== 'local-only') return null;
  if (state.status !== 'ok' || !state.data.has || state.data.dismissed) return null;

  async function dismiss() {
    await db.keys.put({ id: DISMISSED, value: true });
    state.retry();
  }

  return (
    <Card data-testid="cloud-banner">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <Cloud aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{t.title}</p>
            <p className="text-sm text-muted-foreground">{t.hint}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link to="/more/settings">{t.action}</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => void dismiss()}>{t.dismiss}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
