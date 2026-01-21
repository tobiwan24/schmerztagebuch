import type { BlockType } from '../types/blocks';

interface BlockPaletteProps {
  onAddBlock: (type: BlockType) => void;
}

export default function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  // Liste aller verfügbaren Block-Typen mit Icons
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
    <div className="block-palette">
      <h3 className="palette-title">Bausteine hinzufügen</h3>
      
      <div className="palette-grid">
        {blockTypes.map((blockType) => (
          <button
            key={blockType.type}
            onClick={() => onAddBlock(blockType.type)}
            className="palette-item"
          >
            <span className="palette-icon">{blockType.icon}</span>
            <span className="palette-label">{blockType.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
