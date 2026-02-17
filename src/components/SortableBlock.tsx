import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Block, BlockValue } from '../types/blocks';
import BlockRenderer from './BlockRenderer';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Trash2, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { DashboardToggleButtons } from './dashboard';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MultiSelectEditor } from './multiselect';
import './multiselect/MultiSelectEditor.css';

interface SortableBlockProps {
  block: Block;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (value: BlockValue) => void;
  onLabelChange?: (blockId: string, newLabel: string) => void;
  onToggleHideLabel?: (blockId: string) => void;
  onToggleDashboard?: (blockId: string) => void;
  showAdvancedActions?: boolean;
  isExpanded?: boolean;
  onSliderSettingsChange?: (blockId: string, settings: { min?: number; max?: number; step?: number }) => void;
  onBodyMapTypeChange?: (blockId: string, type: 'pain' | 'function') => void;
  onMultiSelectButtonsChange?: (blockId: string, buttons: { text: string; color: string }[]) => void;
  isDndMode?: boolean;
  isNew?: boolean;
}

export default function SortableBlock({ 
  block, 
  onEdit, 
  onDelete, 
  onChange,
  onLabelChange,
  onToggleHideLabel,
  onToggleDashboard,
  showAdvancedActions = false,
  isExpanded = false,
  onSliderSettingsChange,
  onBodyMapTypeChange,
  onMultiSelectButtonsChange,
  isDndMode = false,
  isNew = false
}: SortableBlockProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete();
  };

  const handleCancelDelete = () => {
    setShowDeleteDialog(false);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      className={`p-4 touch-none sortable-block ${isDndMode ? 'dnd-mode-active' : ''} ${isNew ? 'block-new-highlight' : ''}`}
      {...(isDndMode ? { ...attributes, ...listeners } : {})}
    >
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={block.label}
          onChange={(e) => onLabelChange?.(block.id, e.target.value)}
          className={`text-sm font-medium flex-1 ${block.hideLabelInDiary ? 'line-through opacity-50' : ''} ${isNew ? 'block-label-new' : ''}`}
          placeholder="Block-Überschrift..."
          title={block.hideLabelInDiary ? "Label ausgeblendet in Tagebuch" : ""}
          readOnly={isDndMode}
          disabled={isDndMode}
          style={{ 
            width: `${Math.max(block.label.length * 8 + 40, 100)}px`,
            minWidth: '100px',
            maxWidth: '100%'
          }}
        />

        {showAdvancedActions && (
          <div className="flex items-center button-group-touch">
            {/* Dashboard Toggle Buttons */}
            {onToggleDashboard && (
              <DashboardToggleButtons
                block={block}
                onToggle={onToggleDashboard}
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
                <EyeOff size={20} className="text-destructive" />
              ) : (
                <Eye size={20} />
              )}
            </Button>
          </div>
        )}

        {/* Toggle Button für Edit-Container - für ALLE Block-Typen */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="btn-touch-target"
          disabled={isDndMode}
          onClick={onEdit}
          title={isExpanded ? "Bearbeitung schließen" : "Bearbeiten"}
        >
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </Button>
      </div>

      {/* Block Renderer - MultiSelect nur wenn NICHT expanded */}
      {block.type === 'multiselect' ? (
        !isExpanded && (
          <div>
            <BlockRenderer
              block={block}
              onChange={onChange}
              readOnly={true}
              hideLabel={true}
            />
          </div>
        )
      ) : (
        <div>
          <BlockRenderer
            block={block}
            onChange={onChange}
            readOnly={false}
            hideLabel={true}
          />
        </div>
      )}

      {/* Collapsible Settings Container - Slider */}
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
          <Separator />
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDeleteClick}
          >
            <Trash2 size={20} className="mr-2" />
            Block löschen
          </Button>
        </div>
      )}

      {/* Collapsible Settings Container - BodyMap */}
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
          <Separator />
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDeleteClick}
          >
            <Trash2 size={20} className="mr-2" />
            Block löschen
          </Button>
        </div>
      )}

      {/* Collapsible Settings Container - MultiSelect */}
      {isExpanded && block.type === 'multiselect' && (
        <div className="mt-4 p-3 bg-secondary/20 rounded-lg space-y-3">
          <MultiSelectEditor
            buttons={block.multiSelectOptions || []}
            onChange={(newButtons) => onMultiSelectButtonsChange?.(block.id, newButtons)}
          />
          <Separator />
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDeleteClick}
          >
            <Trash2 size={20} className="mr-2" />
            Block löschen
          </Button>
        </div>
      )}

      {/* Collapsible Settings Container - Date */}
      {isExpanded && block.type === 'date' && (
        <div className="mt-4 p-3 bg-secondary/20 rounded-lg space-y-3">
          <p className="text-sm text-muted-foreground">
            Datumsblock hat keine zusätzlichen Einstellungen.
          </p>
          <Separator />
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDeleteClick}
          >
            <Trash2 size={20} className="mr-2" />
            Block löschen
          </Button>
        </div>
      )}

      {/* Collapsible Settings Container - TextArea */}
      {isExpanded && block.type === 'textarea' && (
        <div className="mt-4 p-3 bg-secondary/20 rounded-lg space-y-3">
          <p className="text-sm text-muted-foreground">
            Textfeld hat keine zusätzlichen Einstellungen.
          </p>
          <Separator />
          <Button
            variant="outline"
            className="w-full text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDeleteClick}
          >
            <Trash2 size={20} className="mr-2" />
            Block löschen
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block löschen?</DialogTitle>
            <DialogDescription>
              Möchtest du den Block "{block.label}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelDelete}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
