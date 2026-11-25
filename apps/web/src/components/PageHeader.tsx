import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SyncStatus } from '@/components/SyncStatus';
import { de } from '@/i18n/de';

/** Seitenkopf; mit `back` ein Zurück-Button (folgt der Browser-Historie, wie die Zurück-Geste). Mit `subtitle` steht darunter klein eine Zeile (RDM-028 P5), mit `wrap` darf der Titel umbrechen. Mit `sync` (nur Tab-Hauptseiten) steht der Sync-Status rechtsbündig in der Titelzeile. */
export function PageHeader({ title, subtitle, wrap = false, back = false, sync = false }: { title: ReactNode; subtitle?: ReactNode; wrap?: boolean; back?: boolean; sync?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className={`flex min-w-0 gap-2 ${subtitle ? 'items-start' : 'items-center'}`}>
      {back ? (
        <Button variant="ghost" size="icon" aria-label={de.nav.back} onClick={() => void navigate(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
      ) : null}
      {subtitle ? (
        <div className="flex min-w-0 flex-col pt-1">
          <h1 className={`min-w-0 text-xl font-semibold ${wrap ? 'break-words' : 'truncate'}`}>{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      ) : (
        <h1 className={`min-w-0 text-xl font-semibold ${wrap ? 'break-words' : 'truncate'}`}>{title}</h1>
      )}
      {sync ? <SyncStatus /> : null}
    </header>
  );
}
