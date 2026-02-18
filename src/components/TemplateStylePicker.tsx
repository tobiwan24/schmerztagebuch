import React, { useState, useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { AVAILABLE_ICON_NAMES, getIconComponent } from '../utils/iconUtils';
import type { Template } from '../types/database';
import type { Block } from '../types/blocks';

interface TemplateStylePickerProps {
  templateName: string;
  onNameChange: (name: string) => void;
  currentIcon?: string;
  currentColor?: string;
  onIconChange: (icon: string) => void;
  // Bulk Actions
  blocks: Block[];
  onToggleAllDashboard: () => void;
  onToggleAllLabels: () => void;
  // Advanced Actions Toggle
  showAdvancedActions: boolean;
  onToggleAdvancedActions: () => void;
  // Template Switcher
  templates: Template[];
  currentTemplateId: number;
  onSwitchTemplate: (id: number) => void;
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
  templates,
  currentTemplateId,
  onSwitchTemplate,
}: TemplateStylePickerProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearchTerm, setIconSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const currentIndex = templates.findIndex(t => t.id === currentTemplateId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < templates.length - 1;

  function handlePrev() {
    if (!hasPrev) return;
    onSwitchTemplate(templates[currentIndex - 1].id!);
  }

  function handleNext() {
    if (!hasNext) return;
    onSwitchTemplate(templates[currentIndex + 1].id!);
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    onNameChange(e.target.value);
  }

  // Max Icons ohne Suche (Performance: 1500 Icons auf einmal crasht/laggt)
  const MAX_ICONS_WITHOUT_SEARCH = 120;

  // Gefilterte Icons basierend auf Suchbegriff
  const filteredIcons = useMemo(() => {
    if (!iconSearchTerm.trim()) {
      // Ohne Suche: nur erste 120 Icons zeigen
      return AVAILABLE_ICON_NAMES.slice(0, MAX_ICONS_WITHOUT_SEARCH);
    }
    const search = iconSearchTerm.toLowerCase();
    return AVAILABLE_ICON_NAMES.filter(iconName =>
      iconName.toLowerCase().includes(search)
    );
  }, [iconSearchTerm]);

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
      {/* Header: Template Name + Switcher + Collapse */}
      <div className="flex items-center gap-1 mb-3">
        <div className="template-nav-arrows template-nav-prev flex items-center gap-0">
          <button
            onClick={handlePrev}
            disabled={!hasPrev}
            className="btn-touch-target flex items-center justify-center hover:bg-accent rounded transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Vorherige Vorlage"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <Input
          value={templateName}
          onChange={handleNameChange}
          className="text-base font-medium flex-1"
          placeholder="Vorlagen-Name eingeben..."
        />

        <div className="template-nav-arrows template-nav-next flex items-center gap-0">
          <button
            onClick={handleNext}
            disabled={!hasNext}
            className="btn-touch-target flex items-center justify-center hover:bg-accent rounded transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Nächste Vorlage"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="template-collapse-btn btn-touch-target flex items-center justify-center hover:bg-accent rounded transition-colors flex-shrink-0"
          title={isExpanded ? 'Einklappen' : 'Ausklappen'}
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
        <Card className="p-4 space-y-3 mt-4">
          {/* Search Input */}
          <div>
            <Input
              type="text"
              placeholder="Icon suchen... (z.B. heart, star, user)"
              value={iconSearchTerm}
              onChange={(e) => setIconSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Icon Grid */}
          <div className="icon-picker-grid">
            {filteredIcons.length > 0 ? (
              filteredIcons.map((iconName) => {
                const IconComponent = getIconComponent(iconName);
                const isSelected = currentIcon.toLowerCase() === iconName.toLowerCase();
                return (
                  <button
                    key={iconName}
                    onClick={() => {
                      onIconChange(iconName);
                      setShowIconPicker(false);
                      setIconSearchTerm('');
                    }}
                    className={cn(
                      "icon-picker-button",
                      isSelected && "icon-picker-button-selected"
                    )}
                    style={isSelected ? { backgroundColor: currentColor } : undefined}
                    title={iconName}
                  >
                    {React.createElement(IconComponent, {
                      size: 20,
                      className: isSelected ? 'text-white' : 'text-muted-foreground'
                    })}
                  </button>
                );
              })
            ) : (
              <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                Keine Icons gefunden für "{iconSearchTerm}"
              </div>
            )}
          </div>
          {/* Hinweis wenn ohne Suche limitiert */}
          {!iconSearchTerm.trim() && AVAILABLE_ICON_NAMES.length > MAX_ICONS_WITHOUT_SEARCH && (
            <p className="text-xs text-muted-foreground text-center">
              {MAX_ICONS_WITHOUT_SEARCH} von {AVAILABLE_ICON_NAMES.length} Icons — suche nach Name für mehr
            </p>
          )}
        </Card>
      )}
    </Card>
  );
}
