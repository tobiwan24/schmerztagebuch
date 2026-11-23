// Icon + Farbe einer Vorlage (Spec 05 „Vorlagen-Editor", A-037): feste Lucide-Liste und 8 Farb-Tokens.
// Unbekannte Namen/Werte (z. B. aus der v2-Migration) fallen auf Standardsymbol/-farbe zurück.
import {
  Activity, BookOpen, Brain, Coffee, Droplets, Dumbbell, Flame, Heart, HeartPulse, Moon, Pill, Smile, Stethoscope, Sun, Thermometer, Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveTemplateColor, resolveTemplateIcon } from '@/lib/template-style';

export const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Activity, HeartPulse, Zap, Brain, Pill, Stethoscope, Moon, Sun, Thermometer, Droplets, Flame, Heart, Smile, BookOpen, Dumbbell, Coffee,
};

/** Token → Text-, Hintergrund- bzw. helle Tönungsklasse (statisch, damit Tailwind sie findet). */
export const TEMPLATE_COLORS: Record<string, { text: string; bg: string; tint: string }> = {
  red: { text: 'text-red-600', bg: 'bg-red-600', tint: 'bg-red-600/10' },
  orange: { text: 'text-orange-600', bg: 'bg-orange-600', tint: 'bg-orange-600/10' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-600', tint: 'bg-amber-600/10' },
  green: { text: 'text-green-600', bg: 'bg-green-600', tint: 'bg-green-600/10' },
  teal: { text: 'text-teal-600', bg: 'bg-teal-600', tint: 'bg-teal-600/10' },
  blue: { text: 'text-blue-600', bg: 'bg-blue-600', tint: 'bg-blue-600/10' },
  violet: { text: 'text-violet-600', bg: 'bg-violet-600', tint: 'bg-violet-600/10' },
  pink: { text: 'text-pink-600', bg: 'bg-pink-600', tint: 'bg-pink-600/10' },
};

export const DEFAULT_TEMPLATE_ICON = 'BookOpen';
export const DEFAULT_TEMPLATE_COLOR = 'blue';

export function TemplateIcon({ icon, color, className }: { icon?: string | undefined; color?: string | undefined; className?: string }) {
  // v2-Namen/-Hex-Farben der migrierten Vorlagen werden nur zur Anzeige zugeordnet (RDM-028 P3, A-135).
  const name = resolveTemplateIcon(icon);
  const token = resolveTemplateColor(color);
  const Icon = TEMPLATE_ICONS[name]!;
  const tone = (token ? TEMPLATE_COLORS[token] : undefined)?.text ?? 'text-muted-foreground';
  return <Icon aria-hidden className={cn('size-4 shrink-0', tone, className)} data-testid="template-icon" data-icon={name} data-color={token ?? ''} />;
}

/** Symbol auf hell getöntem, abgerundetem Quadrat (Verlauf-Cards); ohne Farbe neutral. */
export function TemplateIconBadge({ icon, color, className }: { icon?: string | undefined; color?: string | undefined; className?: string }) {
  const token = resolveTemplateColor(color);
  const tint = (token ? TEMPLATE_COLORS[token] : undefined)?.tint ?? 'bg-muted';
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tint, className)}>
      <TemplateIcon icon={icon} color={color} className="size-5" />
    </span>
  );
}
