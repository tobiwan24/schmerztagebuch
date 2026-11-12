import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { de } from '@/i18n/de';

/** Seitenkopf; mit `back` ein Zurück-Button (folgt der Browser-Historie, wie die Zurück-Geste). */
export function PageHeader({ title, back = false }: { title: string; back?: boolean }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-2">
      {back ? (
        <Button variant="ghost" size="icon" aria-label={de.nav.back} onClick={() => void navigate(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
      ) : null}
      <h1 className="text-xl font-semibold">{title}</h1>
    </header>
  );
}
