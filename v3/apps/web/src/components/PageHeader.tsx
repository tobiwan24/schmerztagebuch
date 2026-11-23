import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncStatus } from '@/components/SyncStatus';
import { de } from '@/i18n/de';

/** Seitenkopf; mit `back` ein Zurück-Button (folgt der Browser-Historie, wie die Zurück-Geste). Mit `sync` (nur Tab-Hauptseiten) steht der Sync-Status rechtsbündig in der Titelzeile. */
export function PageHeader({ title, back = false, sync = false }: { title: string; back?: boolean; sync?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className="flex min-w-0 items-center gap-2">
      {back ? (
        <Button variant="ghost" size="icon" aria-label={de.nav.back} onClick={() => void navigate(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
      ) : null}
      <h1 className="min-w-0 truncate text-xl font-semibold">{title}</h1>
      {sync ? <SyncStatus /> : null}
    </header>
  );
}
