// Icon + Farbe einer Vorlage (Spec 05 „Vorlagen-Editor", A-037): feste Lucide-Liste und 8 Farb-Tokens.
// Unbekannte Namen/Werte (z. B. aus der v2-Migration) fallen auf Standardsymbol/-farbe zurück.
import {
  Activity, BookOpen, Brain, Coffee, Droplets, Dumbbell, Flame, Heart, HeartPulse, Moon, Pill, Smile, Stethoscope, Sun, Thermometer, Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Activity, HeartPulse, Zap, Brain, Pill, Stethoscope, Moon, Sun, Thermometer, Droplets, Flame, Heart, Smile, BookOpen, Dumbbell, Coffee,
};

/** Token → Text- bzw. Hintergrundklasse (statisch, damit Tailwind sie findet). */
export const TEMPLATE_COLORS: Record<string, { text: string; bg: string }> = {
  red: { text: 'text-red-600', bg: 'bg-red-600' },
  orange: { text: 'text-orange-600', bg: 'bg-orange-600' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-600' },
  green: { text: 'text-green-600', bg: 'bg-green-600' },
  teal: { text: 'text-teal-600', bg: 'bg-teal-600' },
  blue: { text: 'text-blue-600', bg: 'bg-blue-600' },
  violet: { text: 'text-violet-600', bg: 'bg-violet-600' },
  pink: { text: 'text-pink-600', bg: 'bg-pink-600' },
};

export const DEFAULT_TEMPLATE_ICON = 'BookOpen';
export const DEFAULT_TEMPLATE_COLOR = 'blue';

export function TemplateIcon({ icon, color, className }: { icon?: string | undefined; color?: string | undefined; className?: string }) {
  const Icon = (icon ? TEMPLATE_ICONS[icon] : undefined) ?? TEMPLATE_ICONS[DEFAULT_TEMPLATE_ICON]!;
  const tone = (color ? TEMPLATE_COLORS[color] : undefined)?.text ?? 'text-muted-foreground';
  return <Icon aria-hidden className={cn('size-4 shrink-0', tone, className)} data-testid="template-icon" data-icon={icon ?? ''} data-color={color ?? ''} />;
}
