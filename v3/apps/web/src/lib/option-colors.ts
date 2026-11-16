// Farben von Multiselect-Optionen im Formular (BLK-41): jede gespeicherte Farbe wird der nächsten Palettenfarbe zugeordnet
// (v2-Migration und Katalog liefern auch Töne außerhalb der Editor-Palette). Die Klassen sind statisch ausgeschrieben,
// damit Tailwind sie erhält; es gibt keine `style`-Props außerhalb von `components/ui/`.
//
// Kontrast (WCAG AA): nicht gewählt = Tönung -50 mit Text -900; gewählt = Fläche -700 mit weißem Text (≥ 4,5 : 1).
// Zusätzlich zeigt das Formular am gewählten Knopf ein Häkchen, die Auswahl hängt also nicht allein an der Farbe.

interface Tone {
  hex: string;
  idle: string;
  selected: string;
}

export const OPTION_TONES: readonly Tone[] = [
  { hex: '#ef4444', idle: 'border-red-500 bg-red-50 text-red-900 hover:bg-red-100', selected: 'border-red-700 bg-red-700 text-white hover:bg-red-700 hover:text-white' },
  { hex: '#f97316', idle: 'border-orange-500 bg-orange-50 text-orange-900 hover:bg-orange-100', selected: 'border-orange-700 bg-orange-700 text-white hover:bg-orange-700 hover:text-white' },
  { hex: '#eab308', idle: 'border-yellow-500 bg-yellow-50 text-yellow-900 hover:bg-yellow-100', selected: 'border-yellow-700 bg-yellow-700 text-white hover:bg-yellow-700 hover:text-white' },
  { hex: '#22c55e', idle: 'border-green-500 bg-green-50 text-green-900 hover:bg-green-100', selected: 'border-green-700 bg-green-700 text-white hover:bg-green-700 hover:text-white' },
  { hex: '#06b6d4', idle: 'border-cyan-500 bg-cyan-50 text-cyan-900 hover:bg-cyan-100', selected: 'border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-700 hover:text-white' },
  { hex: '#3b82f6', idle: 'border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-100', selected: 'border-blue-700 bg-blue-700 text-white hover:bg-blue-700 hover:text-white' },
  { hex: '#6366f1', idle: 'border-indigo-500 bg-indigo-50 text-indigo-900 hover:bg-indigo-100', selected: 'border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-700 hover:text-white' },
  { hex: '#8b5cf6', idle: 'border-violet-500 bg-violet-50 text-violet-900 hover:bg-violet-100', selected: 'border-violet-700 bg-violet-700 text-white hover:bg-violet-700 hover:text-white' },
  { hex: '#ec4899', idle: 'border-pink-500 bg-pink-50 text-pink-900 hover:bg-pink-100', selected: 'border-pink-700 bg-pink-700 text-white hover:bg-pink-700 hover:text-white' },
];

function rgb(hex: string): [number, number, number] | null {
  const v = hex.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(v) ?? /^#?([0-9a-f]{3})$/i.exec(v);
  if (!m) return null;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Nächste Palettenfarbe (Abstand im RGB-Raum); keine gültige Hex-Farbe → `null` (neutraler Knopf). */
export function optionTone(color: string): Tone | null {
  const c = rgb(color);
  if (!c) return null;
  let best = OPTION_TONES[0]!;
  let bestD = Infinity;
  for (const tone of OPTION_TONES) {
    const t = rgb(tone.hex)!;
    const d = (t[0] - c[0]) ** 2 + (t[1] - c[1]) ** 2 + (t[2] - c[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = tone;
    }
  }
  return best;
}
