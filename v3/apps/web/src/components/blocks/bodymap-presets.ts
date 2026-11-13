// Standard-Bilder der Body-Map, portiert aus v2 `src/utils/bodymapPresets.ts` (IDs unverändert, Migration ordnet darüber zu).
// Als Vite-Import gebündelt → gehasht unter /assets/ und damit vom Service Worker offline vorgehalten (SYN-15).
import koerperVorderseite from '@/assets/bodymap/koerper-vorderseite.png';
import koerperRueckseite from '@/assets/bodymap/koerper-rueckseite.png';
import fussDorsal from '@/assets/bodymap/fuss-dorsal.png';
import fussLateral from '@/assets/bodymap/fuss-lateral.png';
import fussMedial from '@/assets/bodymap/fuss-medial.png';
import fussPlantar from '@/assets/bodymap/fuss-plantar.png';

export const BODYMAP_PRESETS = [
  { id: 'default-koerper-vorderseite', src: koerperVorderseite },
  { id: 'default-koerper-rueckseite', src: koerperRueckseite },
  { id: 'default-fuss-dorsal', src: fussDorsal },
  { id: 'default-fuss-lateral', src: fussLateral },
  { id: 'default-fuss-medial', src: fussMedial },
  { id: 'default-fuss-plantar', src: fussPlantar },
] as const;

export type BodymapPresetId = (typeof BODYMAP_PRESETS)[number]['id'];

export const presetById = (id: string) => BODYMAP_PRESETS.find((p) => p.id === id);

/** Farbe je Intensität wie in v2 (grün ≤ 3, gelb ≤ 6, orange ≤ 8, sonst rot). */
export function intensityFill(intensity: number | undefined): string {
  const i = intensity ?? 5;
  if (i <= 3) return 'fill-green-500';
  if (i <= 6) return 'fill-yellow-500';
  if (i <= 8) return 'fill-orange-500';
  return 'fill-red-500';
}

export function intensityStroke(intensity: number | undefined): string {
  const i = intensity ?? 5;
  if (i <= 3) return 'stroke-green-500';
  if (i <= 6) return 'stroke-yellow-500';
  if (i <= 8) return 'stroke-orange-500';
  return 'stroke-red-500';
}
