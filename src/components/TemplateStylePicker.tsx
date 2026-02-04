import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ICON_MAP, ICON_CATEGORIES, getIconComponent } from '../utils/iconUtils';

interface TemplateStylePickerProps {
  templateName: string;
  onNameChange: (name: string) => void;
  currentIcon?: string;
  currentColor?: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

export default function TemplateStylePicker({
  templateName,
  onNameChange,
  currentIcon = 'book',
  currentColor = '#007AFF',
  onIconChange,
}: TemplateStylePickerProps) {
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Schmerz & Symptome');

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    onNameChange(e.target.value);
  }

  return (
    <Card className="p-4 mb-6 border-2">
      {/* Template Name - Direkt editierbar */}
      <div className="space-y-2 mb-4">
        <Input
          value={templateName}
          onChange={handleNameChange}
          className="text-lg font-semibold"
          placeholder="Template-Name eingeben..."
        />
      </div>

      {/* Icon Selection */}
      <div className="space-y-2">
        <Label className="text-sm">Icon</Label>
        <Button
          onClick={() => setShowIconPicker(!showIconPicker)}
          variant="outline"
          className="w-full justify-start gap-2 h-auto py-3"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: currentColor }}
          >
            {React.createElement(getIconComponent(currentIcon), { size: 16 })}
          </div>

        </Button>
      </div>

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
              return (
                <button
                  key={iconName}
                  onClick={() => {
                    onIconChange(iconName);
                    setShowIconPicker(false);
                  }}
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center transition-all border",
                    currentIcon === iconName
                      ? "border-primary"
                      : "border-border hover:border-primary/50"
                  )}
                  style={currentIcon === iconName ? { backgroundColor: currentColor } : {}}
                  title={iconName}
                >
                  <IconComponent 
                    size={16} 
                    className={currentIcon === iconName ? "text-white" : "text-muted-foreground"}
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
