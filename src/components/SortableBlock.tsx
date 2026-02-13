import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, BlockValue } from '../types/blocks';
import BlockRenderer from './BlockRenderer';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GripVertical, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import { DashboardToggleButtons } from './dashboard';

interface SortableBlockProps {
  block: Block;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (value: BlockValue) => void;
  onToggleHideLabel?: (blockId: string) => void;
  onToggleDashboard?: (blockId: string) => void;
  onConfigureDashboard?: (blockId: string) => void;
  showAdvancedActions?: boolean;
}

export default function SortableBlock({ 
  block, 
  onEdit, 
  onDelete, 
  onChange,
  onToggleHideLabel,
  onToggleDashboard,
  onConfigureDashboard,
  showAdvancedActions = false
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card ref={setNodeRef} style={style} className="p-4 touch-none">
      <div className="flex items-center gap-2 mb-3">
        {/* Drag Handle - DIV statt Button */}
        <div
          className="flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-accent rounded-md transition-colors"
          style={{ minWidth: '44px', minHeight: '44px', width: '44px', height: '44px' }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} className="text-muted-foreground" />
        </div>

        <span 
          className={`flex-1 text-sm font-medium ${block.hideLabelInDiary ? 'line-through opacity-50' : ''}`}
          title={block.hideLabelInDiary ? "Label ausgeblendet in Tagebuch" : ""}
        >
          {block.label}
        </span>

        {showAdvancedActions && (
          <div className="flex items-center button-group-touch">
            {/* Dashboard Toggle Buttons */}
            {onToggleDashboard && onConfigureDashboard && (
              <DashboardToggleButtons
                block={block}
                onToggle={onToggleDashboard}
                onConfigure={onConfigureDashboard}
              />
            )}
            
            <Button 
              onClick={() => onToggleHideLabel?.(block.id)} 
              variant="ghost"
              size="icon"
              className="btn-touch-target"
              title={block.hideLabelInDiary ? "Label in Tagebuch anzeigen" : "Label in Tagebuch ausblenden"}
            >
              {block.hideLabelInDiary ? (
                <EyeOff size={16} className="text-destructive" />
              ) : (
                <Eye size={16} />
              )}
            </Button>
            <Button onClick={onEdit} variant="ghost" size="icon" className="btn-touch-target" title="Bearbeiten">
              <Edit size={16} />
            </Button>
            <Button onClick={onDelete} variant="ghost" size="icon" className="btn-touch-target" title="Löschen">
              <Trash2 size={16} className="text-destructive" />
            </Button>
          </div>
        )}
      </div>

      <div>
        <BlockRenderer
          block={block}
          onChange={onChange}
          readOnly={false}
          hideLabel={true}
        />
      </div>
    </Card>
  );
}
