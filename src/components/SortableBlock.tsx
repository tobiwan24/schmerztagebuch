import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block } from '../types/blocks';
import BlockRenderer from './BlockRenderer';

// NEUE Props-Definition
interface SortableBlockProps {
  block: Block;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (value: string | number | boolean | string[]) => void;
  onLabelChange?: (newLabel: string) => void; // NEU!
  onLabelEdit?: (blockId: string, label: string) => void; // NEU!
  isEditingLabel?: boolean; // NEU!
  tempLabel?: string; // NEU!
}

export default function SortableBlock({ 
  block, 
  onEdit, 
  onDelete, 
  onChange,
  onLabelChange,
  onLabelEdit,
  isEditingLabel,
  tempLabel
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="sortable-block">
      <div className="sortable-toolbar">
        <div {...attributes} {...listeners} className="drag-handle">
          <svg className="icon-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </div>

        {isEditingLabel ? (
          <input
            type="text"
            value={tempLabel}
            onChange={(e) => onLabelChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onLabelEdit?.(block.id, tempLabel || '');
              if (e.key === 'Escape') onLabelEdit?.(block.id, '');
            }}
            className="form-input"
            style={{ flex: 1, fontSize: '0.875rem' }}
            autoFocus
          />
        ) : (
          <span 
            className="block-label"
            onDoubleClick={() => onLabelEdit?.(block.id, block.label)}
            style={{ cursor: 'text' }}
            title="Doppelklick zum Bearbeiten"
          >
            {block.label}
          </span>
        )}

        <div className="button-group">
          <button onClick={onEdit} className="btn-icon" title="Bearbeiten">
            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button onClick={onDelete} className="btn-icon btn-danger" title="Löschen">
            <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <div className="sortable-content">
        <BlockRenderer
          block={block}
          onChange={onChange}
          readOnly={false}
        />
      </div>
    </div>
  );
}