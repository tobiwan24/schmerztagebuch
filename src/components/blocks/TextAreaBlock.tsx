import { useState } from 'react';
import type { Block } from '../../types/blocks';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { CalendarClock, Stethoscope, X, Check } from 'lucide-react';

interface TextAreaBlockProps {
  block: Block;
  onChange: (value: string) => void;
  onDashboardConfigChange?: (config: { eventCategory: 'event' | 'doctor'; eventTitle: string }) => void;
  readOnly?: boolean;
  hideLabel?: boolean;
}

export default function TextAreaBlock({ 
  block, 
  onChange, 
  onDashboardConfigChange,
  readOnly = false, 
  hideLabel = false 
}: TextAreaBlockProps) {
  const [value, setValue] = useState<string>((block.value as string) || '');
  const [showEventConfig, setShowEventConfig] = useState(false);
  const [eventCategory, setEventCategory] = useState<'event' | 'doctor'>(
    block.dashboard?.eventCategory || 'event'
  );
  const [eventTitle, setEventTitle] = useState(block.dashboard?.eventTitle || '');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange(newValue);
  };

  const handleSaveEventConfig = () => {
    if (!eventTitle.trim()) {
      alert('Bitte einen Titel eingeben');
      return;
    }
    
    if (onDashboardConfigChange) {
      onDashboardConfigChange({
        eventCategory,
        eventTitle: eventTitle.trim()
      });
    }
    
    setShowEventConfig(false);
  };

  const handleCancelEventConfig = () => {
    setShowEventConfig(false);
    setEventTitle(block.dashboard?.eventTitle || '');
    setEventCategory(block.dashboard?.eventCategory || 'event');
  };

  const isDashboardEnabled = block.dashboard?.enabled;
  const hasEventConfig = block.dashboard?.eventTitle;

  return (
    <div className="space-y-2">
      {!hideLabel && <Label>{block.label}</Label>}
      <Textarea
        value={value}
        onChange={handleChange}
        readOnly={readOnly}
        disabled={readOnly}
        rows={4}
        className="resize-none"
      />
      
      {/* Dashboard Event-Buttons (nur im Diary, nicht im Editor) */}
      {!readOnly && isDashboardEnabled && onDashboardConfigChange && (
        <div className="space-y-2">
          {!showEventConfig && !hasEventConfig && (
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  setEventCategory('event');
                  setShowEventConfig(true);
                }}
                variant="outline"
                size="icon"
                className="h-8 w-8"
              >
                <CalendarClock size={14} />
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setEventCategory('doctor');
                  setShowEventConfig(true);
                }}
                variant="outline"
                size="icon"
                className="h-8 w-8"
              >
                <Stethoscope size={14} />
              </Button>
            </div>
          )}
          
          {/* Bereits konfiguriert - Anzeige */}
          {hasEventConfig && !showEventConfig && (
            <Card className="p-2 bg-secondary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {block.dashboard?.eventCategory === 'doctor' ? (
                    <Stethoscope size={12} className="text-primary" />
                  ) : (
                    <CalendarClock size={12} className="text-primary" />
                  )}
                  <div>
                    <p className="text-xs font-semibold">
                      {block.dashboard?.eventCategory === 'doctor' ? 'Arztbesuch' : 'Event'}
                    </p>
                    <p className="text-xs text-muted-foreground">{block.dashboard?.eventTitle}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (onDashboardConfigChange) {
                      onDashboardConfigChange({ eventCategory: 'event', eventTitle: '' });
                    }
                  }}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                >
                  <X size={12} />
                </Button>
              </div>
            </Card>
          )}
          
          {/* Event-Konfigurations-Popup - Kompakt */}
          {showEventConfig && (
            <Card className="p-3 border-2 border-primary">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    {eventCategory === 'doctor' ? '🩺 Arztbesuch' : '⚡ Event'}
                  </Label>
                  <Button
                    type="button"
                    onClick={handleCancelEventConfig}
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                  >
                    <X size={12} />
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Input
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Titel eingeben..."
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveEventConfig();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleSaveEventConfig}
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <Check size={14} />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
