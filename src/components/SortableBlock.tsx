import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, BlockValue } from '../types/blocks';
import BlockRenderer from './BlockRenderer';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { GripVertical, Edit, Trash2, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { DashboardToggleButtons } from './dashboard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SortableBlockProps {
  block: Block;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (value: BlockValue) => void;
  onLabelChange?: (blockId: string, newLabel: string) => void;
  onToggleHideLabel?: (blockId: string) => void;
  onToggleDashboard?: (blockId: string) => void;
  onConfigureDashboard?: (blockId: string) => void;
  showAdvancedActions?: boolean;
  isExpanded?: boolean;
  onSliderSettingsChange?: (blockId: string, settings: { min?: number; max?: number; step?: number }) => void;
  onBodyMapTypeChange?: (blockId: string, type: 'pain' | 'function') => void;
}

export default function SortableBlock({ 
  block, 
  onEdit, 
  onDelete, 
  onChange,
  onLabelChange,
  onToggleHideLabel,
  onToggleDashboard,
  onConfigureDashboard,
  showAdvancedActions = false,
  isExpanded = false,
  onSliderSettingsChange,
  onBodyMapTypeChange
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

        <Input
          value={block.label}
          onChange={(e) => onLabelChange?.(block.id, e.target.value)}
          className={`text-sm font-medium flex-1 ${block.hideLabelInDiary ? 'line-through opacity-50' : ''}`}
          placeholder="Block-Überschrift..."
          title={block.hideLabelInDiary ? "Label ausgeblendet in Tagebuch" : ""}
          style={{ 
            width: `${Math.max(block.label.length * 8 + 40, 100)}px`,
            minWidth: '100px',
            maxWidth: '100%'
          }}
        />

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
          </div>
        )}

        {/* Dropdown Menu - immer sichtbar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="btn-touch-target"
            >
              <ChevronDown size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Bearbeiten nur für Slider, BodyMap, MultiSelect */}
            {['slider', 'bodymap', 'multiselect'].includes(block.type) && (
              <DropdownMenuItem onClick={onEdit}>
                <Edit size={16} className="mr-2" />
                Bearbeiten
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 size={16} className="mr-2" />
              Löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div>
        <BlockRenderer
          block={block}
          onChange={onChange}
          readOnly={false}
          hideLabel={true}
        />
      </div>

      {/* Collapsible Settings Container - nur für Slider & BodyMap */}
      {isExpanded && block.type === 'slider' && (
        <div className="mt-4 p-3 bg-secondary/20 rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Label className="text-xs">Min</Label>
              <Input
                type="number"
                value={block.min ?? 0}
                onChange={(e) => onSliderSettingsChange?.(block.id, { min: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Max</Label>
              <Input
                type="number"
                value={block.max ?? 10}
                onChange={(e) => onSliderSettingsChange?.(block.id, { max: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Schritt</Label>
              <Input
                type="number"
                value={block.step ?? 1}
                onChange={(e) => onSliderSettingsChange?.(block.id, { step: Number(e.target.value) })}
                className="mt-1"
                step="0.1"
              />
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`dashboard-${block.id}`}
              checked={block.dashboard?.enabled ?? false}
              onChange={() => onToggleDashboard?.(block.id)}
              className="w-4 h-4 cursor-pointer"
            />
            <Label htmlFor={`dashboard-${block.id}`} className="text-sm cursor-pointer select-none">
              Datenauswertung aktivieren
            </Label>
          </div>
        </div>
      )}

      {isExpanded && block.type === 'bodymap' && (
        <div className="mt-4 p-3 bg-secondary/20 rounded-lg space-y-3">
          <div>
            <Label className="text-sm mb-2 block">Dashboard-Typ</Label>
            <div className="flex gap-2">
              <Button
                variant={block.dashboard?.type === 'pain' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onBodyMapTypeChange?.(block.id, 'pain')}
                className="flex-1"
              >
                Schmerzwert
              </Button>
              <Button
                variant={block.dashboard?.type === 'function' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onBodyMapTypeChange?.(block.id, 'function')}
                className="flex-1"
              >
                Funktionswert
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`dashboard-${block.id}`}
              checked={block.dashboard?.enabled ?? false}
              onChange={() => onToggleDashboard?.(block.id)}
              className="w-4 h-4 cursor-pointer"
            />
            <Label htmlFor={`dashboard-${block.id}`} className="text-sm cursor-pointer select-none">
              Datenauswertung aktivieren
            </Label>
          </div>
        </div>
      )}
    </Card>
  );
}
