import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui-Hilfsfunktion: Klassen zusammenführen, Tailwind-Konflikte auflösen. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
