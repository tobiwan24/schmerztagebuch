// Zuordnung von Vorlagen-Symbol und -Farbe beim Anzeigen (RDM-028 P3, A-135): migrierte v2-Vorlagen tragen v2-Icon-Namen
// und Hex-Farben; gespeichert bleibt der Rohwert, aufgelöst wird nur für die Anzeige (und als Vorbelegung im Editor).
import { rgb } from './option-colors';

export const TEMPLATE_ICON_NAMES = [
  'Activity', 'HeartPulse', 'Zap', 'Brain', 'Pill', 'Stethoscope', 'Moon', 'Sun', 'Thermometer', 'Droplets', 'Flame', 'Heart', 'Smile', 'BookOpen', 'Dumbbell', 'Coffee',
] as const;
export type TemplateIconName = (typeof TEMPLATE_ICON_NAMES)[number];

export const TEMPLATE_COLOR_TOKENS = ['black', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'] as const;
export type TemplateColorToken = (typeof TEMPLATE_COLOR_TOKENS)[number];

/** Tailwind-600-Näherungen in sRGB (Tailwind v4 nutzt oklch); Schwarz nimmt nicht an der Hex-Zuordnung teil. */
const TOKEN_HEX: Record<Exclude<TemplateColorToken, 'black'>, string> = {
  red: '#dc2626', orange: '#ea580c', amber: '#d97706', green: '#16a34a', teal: '#0d9488', blue: '#2563eb', violet: '#7c3aed', pink: '#db2777',
};

/** v2-Icon-Namen (db.ts DEFAULT_ICONS, Katalog) und häufige Lucide-Namen → v3-Symbol; Schlüssel kleingeschrieben. */
export const V2_ICON_MAP: Readonly<Record<string, TemplateIconName>> = {
  flame: 'Flame', alertcircle: 'Zap', alerttriangle: 'Zap', brain: 'Brain', user: 'Activity', heartpulse: 'HeartPulse', hand: 'Activity',
  footprints: 'Activity', eye: 'Brain', ear: 'Brain', trendingup: 'Activity', target: 'Activity', pill: 'Pill', syringe: 'Pill',
  stethoscope: 'Stethoscope', activity: 'Activity', thermometer: 'Thermometer', book: 'BookOpen', bookopen: 'BookOpen', bed: 'Moon',
  beddouble: 'Moon', sleep: 'Moon', moon: 'Moon', coffee: 'Coffee', smile: 'Smile', smileplus: 'Smile', calendar: 'BookOpen',
  heart: 'Heart', droplet: 'Droplets', droplets: 'Droplets', sun: 'Sun', dumbbell: 'Dumbbell', zap: 'Zap',
};

export function resolveTemplateIcon(icon?: string): TemplateIconName {
  if (!icon) return 'BookOpen';
  const exact = TEMPLATE_ICON_NAMES.find((n) => n === icon);
  if (exact) return exact;
  return V2_ICON_MAP[icon.trim().toLowerCase().replace(/[\s_-]/g, '')] ?? 'BookOpen';
}

/** Standardfarbe Schwarz: fehlend/grau/ungültig → 'black'; sonst der nächste Farb-Token (RGB-Abstand). */
export function resolveTemplateColor(color?: string): TemplateColorToken {
  if (!color) return 'black';
  const exact = TEMPLATE_COLOR_TOKENS.find((t) => t === color);
  if (exact) return exact;
  const c = rgb(color);
  if (!c) return 'black';
  if (Math.max(...c) - Math.min(...c) < 30) return 'black';
  let best: TemplateColorToken = 'blue';
  let bestD = Infinity;
  for (const t of Object.keys(TOKEN_HEX) as (keyof typeof TOKEN_HEX)[]) {
    const h = rgb(TOKEN_HEX[t])!;
    const d = (h[0] - c[0]) ** 2 + (h[1] - c[1]) ** 2 + (h[2] - c[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
