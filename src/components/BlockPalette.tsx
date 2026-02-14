import type { BlockType } from '../types/blocks';
import { Button } from "@/components/ui/button";

interface BlockPaletteProps {
  onAddBlock: (type: BlockType) => void;
}

export default function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  const blockTypes = [
    { type: 'textarea' as BlockType, label: 'Textfeld', icon: '📄' },
    { type: 'slider' as BlockType, label: 'Schieberegler', icon: '🎚️' },
    { type: 'date' as BlockType, label: 'Datum', icon: '📅' },
    { type: 'multiselect' as BlockType, label: 'Auswahl', icon: '🏷️' },
    // LEGACY: Image-Block aus Palette entfernt - Funktionalität in TextArea integriert
    // { type: 'image' as BlockType, label: 'Bild', icon: '🖼️' },
    { type: 'bodymap' as BlockType, label: 'Körperkarte', icon: '🧍' }
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {blockTypes.map((blockType) => (
        <Button
          key={blockType.type}
          onClick={() => onAddBlock(blockType.type)}
          variant="outline"
          className="h-auto py-3 px-3 flex-col gap-1 border"
          style={{ minHeight: '60px' }}
        >
          <span className="text-2xl">{blockType.icon}</span>
          <span className="text-xs">{blockType.label}</span>
        </Button>
      ))}
    </div>
  );
}
