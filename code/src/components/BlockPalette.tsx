import type { BlockType } from '../types/blocks';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface BlockPaletteProps {
  onAddBlock: (type: BlockType) => void;
}

export default function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  const blockTypes = [
    { type: 'text' as BlockType, label: 'Text', icon: '📝' },
    { type: 'textarea' as BlockType, label: 'Textfeld', icon: '📄' },
    { type: 'checkbox' as BlockType, label: 'Checkbox', icon: '☑️' },
    { type: 'slider' as BlockType, label: 'Schieberegler', icon: '🎚️' },
    { type: 'date' as BlockType, label: 'Datum', icon: '📅' },
    { type: 'multiselect' as BlockType, label: 'Auswahl', icon: '🏷️' },
    { type: 'image' as BlockType, label: 'Bild', icon: '🖼️' },
    { type: 'bodymap' as BlockType, label: 'Körperkarte', icon: '🧍' }
  ];

  return (
    <Card className="p-4">
      <h3 className="text-base font-semibold mb-3">Bausteine hinzufügen</h3>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {blockTypes.map((blockType) => (
          <Button
            key={blockType.type}
            onClick={() => onAddBlock(blockType.type)}
            variant="outline"
            className="h-auto py-3 flex-col gap-1"
          >
            <span className="text-2xl">{blockType.icon}</span>
            <span className="text-xs">{blockType.label}</span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
