// Einstellungen als Menü wie unter „Mehr" (RDM-028 P7 Reihenfolge, RDM-029 / FEAT-020 Untermenüs).
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { deSettings } from '@/i18n/lazy/settings';
import { deUpdates } from '@/i18n/lazy/updates';
import { deLlm } from '@/i18n/lazy/llm';
import { deDiagnostics } from '@/i18n/lazy/diagnostics';

/** Bereiche in der Reihenfolge aus P7: Konto & Sync, Updates, Sicherheit & Sperre, danach der Rest. */
export const SETTINGS_SECTIONS = [
  { to: '/more/settings/konto', label: deSettings.account },
  { to: '/more/settings/updates', label: deUpdates.title },
  { to: '/more/settings/sicherheit', label: deSettings.securityMenu },
  { to: '/more/settings/darstellung', label: deSettings.appearance },
  { to: '/more/settings/erinnerungen', label: deSettings.remindersMenu },
  { to: '/more/settings/ki', label: deLlm.heading },
  { to: '/more/settings/daten', label: deSettings.dataMenu },
  { to: '/more/settings/diagnose', label: deDiagnostics.open },
] as const;

export function SettingsPage() {
  return (
    <>
      <PageHeader title={deSettings.title} back />
      <Card className="gap-0 py-0" data-testid="settings-menu">
        {SETTINGS_SECTIONS.map(({ to, label }) => (
          <Link key={to} to={to} className="flex min-h-12 items-center justify-between border-b px-4 last:border-b-0">
            {label}
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </Card>
    </>
  );
}
