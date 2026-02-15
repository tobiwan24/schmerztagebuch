import type { BlockType } from '../types/blocks';
import { Button } from "@/components/ui/button";
import { Settings2, NotepadText, CalendarDays, ListChecks, MapPinned } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface BlockPaletteProps {
  onAddBlock: (type: BlockType) => void;
}

interface BlockTypeConfig {
  type: BlockType;
  label: string;
  icon: LucideIcon;
  description: string;
}

export default function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  const blockTypes: BlockTypeConfig[] = [
    { 
      type: 'slider', 
      label: 'Schieberegler', 
      icon: Settings2,
      description: 'Schmerzskala 0-10'
    },
    { 
      type: 'textarea', 
      label: 'Textfeld', 
      icon: NotepadText,
      description: 'Notizen & Dateien'
    },
    { 
      type: 'date', 
      label: 'Datum', 
      icon: CalendarDays,
      description: 'Datumsauswahl'
    },
    { 
      type: 'multiselect', 
      label: 'Auswahl', 
      icon: ListChecks,
      description: 'Mehrfachauswahl'
    },
    // LEGACY: Image-Block aus Palette entfernt - Funktionalität in TextArea integriert
    { 
      type: 'bodymap', 
      label: 'Körperkarte', 
      icon: MapPinned,
      description: 'Schmerzlokalisierung'
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {blockTypes.map((blockType) => {
        const IconComponent = blockType.icon;
        return (
          <Button
            key={blockType.type}
            onClick={() => onAddBlock(blockType.type)}
            variant="outline"
            className="block-palette-card"
          >
            <div className="block-palette-icon">
              <IconComponent size={24} strokeWidth={2} />
            </div>
            <div className="block-palette-text">
              <span className="block-palette-label">{blockType.label}</span>
              <span className="block-palette-description">{blockType.description}</span>
            </div>
          </Button>
        );
      })}
    </div>
  );
}
