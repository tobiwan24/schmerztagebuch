import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ICON_MAP, ICON_CATEGORIES, getIconComponent } from '../utils/iconUtils';

interface TemplateStylePickerProps {
  templateName: string;
  onNameChange: (name: string) => void;
  currentIcon?: string;
  currentColor?: string;
  onIconChange: (icon: string) => void;
  // Bulk Actions
  blocks: any[];
  onToggleAllDashboard: () => void;
  onToggleAllLabels: () => void;
  // Advanced Actions Toggle
  showAdvancedActions: boolean;
  onToggleAdvancedActions: () => void;
}

export default function TemplateStylePicker({
  templateName,
  onNameChange,
  currentIcon = 'book',
  currentColor = '#007AFF',
  onIconChange,
  blocks,
  onToggleAllDashboard,
  onToggleAllLabels,
  showAdvancedActions,
  onToggleAdvancedActions,
}: TemplateStylePickerProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Schmerz & Symptome');
  const [isExpanded, setIsExpanded] = useState(true);

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    onNameChange(e.target.value);
  }

  // Bulk Actions States
  const dashboardCapableBlocks = blocks.filter(b => 
    ['slider', 'bodymap', 'textarea', 'multiselect'].includes(b.type)
  );
  
  const dashboardEnabledCount = dashboardCapableBlocks.filter(b => 
    b.dashboard?.enabled
  ).length;
  
  const labelsHiddenCount = blocks.filter(b => b.hideLabelInDiary).length;
  
  const allDashboardEnabled = dashboardEnabledCount === dashboardCapableBlocks.length && 
    dashboardCapableBlocks.length > 0;
  
  const allLabelsVisible = labelsHiddenCount === 0 && blocks.length > 0;

  return (
    <Card className="p-3 template-settings-card">
      {/* Header: Template Name + Chevron */}
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={templateName}
          onChange={handleNameChange}
          className="text-base font-medium flex-1"
          placeholder="Template-Name eingeben..."
        />
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="btn-touch-target flex items-center justify-center hover:bg-accent rounded transition-colors flex-shrink-0"
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Collapsible Content: Icon + Bulk Actions */}
      {isExpanded && (
        <div className="flex items-start gap-3">
          {/* Icon Button - Bottom-Bar Style */}
          <button
            onClick={() => setShowIconPicker(!showIconPicker)}
            className="template-icon-button flex-shrink-0"
          >
            <div className="template-icon-button-inner">
              {React.createElement(getIconComponent(currentIcon), { size: 28, strokeWidth: 2.5 })}
            </div>
          </button>

          {/* Bulk Actions - Inline */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="bulk-dashboard"
                checked={allDashboardEnabled}
                onChange={onToggleAllDashboard}
                className="w-4 h-4 cursor-pointer"
                disabled={dashboardCapableBlocks.length === 0}
              />
              <Label 
                htmlFor="bulk-dashboard" 
                className="text-sm cursor-pointer select-none"
              >
                Datenauswertung
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="bulk-labels"
                checked={allLabelsVisible}
                onChange={onToggleAllLabels}
                className="w-4 h-4 cursor-pointer"
                disabled={blocks.length === 0}
              />
              <Label 
                htmlFor="bulk-labels" 
                className="text-sm cursor-pointer select-none"
              >
                Überschriften anzeigen
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="advanced-actions"
                checked={showAdvancedActions}
                onChange={onToggleAdvancedActions}
                className="w-4 h-4 cursor-pointer"
              />
              <Label 
                htmlFor="advanced-actions" 
                className="text-sm cursor-pointer select-none"
              >
                Erweiterte Ansicht
              </Label>
            </div>
          </div>
        </div>
      )}

      {/* Icon Picker */}
      {showIconPicker && (
        <Card className="p-4 space-y-4 mt-4">
          <div className="flex flex-wrap gap-2 pb-3 border-b">
            {Object.keys(ICON_CATEGORIES).map((category) => (
              <Button
                key={category}
                onClick={() => setSelectedCategory(category)}
                variant={selectedCategory === category ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
              >
                {category}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-8 gap-2">
            {ICON_CATEGORIES[selectedCategory as keyof typeof ICON_CATEGORIES].map((iconName) => {
              const IconComponent = ICON_MAP[iconName];
              const isSelected = currentIcon === iconName;
              return (
                <button
                  key={iconName}
                  onClick={() => {
                    onIconChange(iconName);
                    setShowIconPicker(false);
                  }}
                  className={cn(
                    "icon-picker-button",
                    isSelected && "icon-picker-button-selected"
                  )}
                  style={isSelected ? { backgroundColor: currentColor } : undefined}
                  title={iconName}
                >
                  <IconComponent 
                    size={16} 
                    className={isSelected ? "text-white" : "text-muted-foreground"}
                  />
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </Card>
  );
}
