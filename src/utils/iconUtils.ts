import * as LucideIcons from 'lucide-react';
import type React from 'react';

type IconComponent = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

// Prüft ob ein Wert eine renderfähige React-Komponente ist
function isRenderableComponent(val: unknown): val is IconComponent {
  if (!val) return false;
  const t = typeof val;
  // React-Komponenten sind functions (oder forwardRef-Objekte mit $$typeof)
  if (t === 'function') return true;
  if (t === 'object' && val !== null) {
    // forwardRef hat $$typeof Symbol
    const obj = val as Record<string, unknown>;
    if (obj['$$typeof'] !== undefined) return true;
    if (typeof obj['render'] === 'function') return true;
  }
  return false;
}

// Alle Icon-Namen für den Picker (ohne Duplikate, ohne Nicht-Komponenten)
export const AVAILABLE_ICON_NAMES: string[] = Object.keys(LucideIcons).filter(key => {
  // Utilities und Namespace-Exporte entfernen
  if (key === 'createLucideIcon' || key === 'Icon' || key === 'icons') return false;
  // Nur den "Haupt-Namen" behalten (kein "Icon"-Suffix, kein "Lucide"-Prefix)
  if (key.endsWith('Icon')) return false;
  if (key.startsWith('Lucide')) return false;
  // Muss eine renderfähige Komponente sein
  const val = (LucideIcons as Record<string, unknown>)[key];
  return isRenderableComponent(val);
});

// Cache für bereits aufgelöste Icons
const iconCache = new Map<string, IconComponent>();

// Hard-Fallback direkt referenziert
const FALLBACK_ICON = LucideIcons.BookOpen as unknown as IconComponent;

/**
 * Gibt die Icon-Komponente für einen gegebenen Namen zurück.
 * Unterstützt: "Flame", "flame", "FLAME" → Flame-Komponente
 */
export function getIconComponent(iconName?: string): IconComponent {
  if (!iconName) return FALLBACK_ICON;

  // Cache-Hit
  if (iconCache.has(iconName)) return iconCache.get(iconName)!;

  // 1) Exakter Treffer
  const exact = (LucideIcons as Record<string, unknown>)[iconName];
  if (isRenderableComponent(exact)) {
    iconCache.set(iconName, exact);
    return exact;
  }

  // 2) Case-insensitiver Treffer
  const lower = iconName.toLowerCase();
  const matchKey = AVAILABLE_ICON_NAMES.find(k => k.toLowerCase() === lower);
  if (matchKey) {
    const matched = (LucideIcons as Record<string, unknown>)[matchKey];
    if (isRenderableComponent(matched)) {
      iconCache.set(iconName, matched);
      return matched;
    }
  }

  // Fallback
  iconCache.set(iconName, FALLBACK_ICON);
  return FALLBACK_ICON;
}
