import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  '#007AFF', // iOS Blau
  '#34C759', // Grün
  '#FF9500', // Orange
  '#FF3B30', // Rot
  '#AF52DE', // Lila
  '#FF2D55', // Pink
  '#5856D6', // Indigo
  '#32ADE6', // Hellblau
  '#FFD60A', // Gelb
  '#8E8E93', // Grau
];

interface ColorPaletteProps {
  selected: string;
  onSelect: (color: string) => void;
}

export function ColorPalette({ selected, onSelect }: ColorPaletteProps) {
  return (
    <div className="color-palette">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          onClick={() => onSelect(color)}
          className={cn(
            "color-swatch",
            selected === color && "selected"
          )}
          style={{ backgroundColor: color }}
          title={color}
          type="button"
        />
      ))}
    </div>
  );
}

export { PRESET_COLORS };
