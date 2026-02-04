import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { X } from 'lucide-react';
import type { Block } from '../../types/blocks';
import type { DashboardDataType, DashboardConfigState } from './types';

interface DashboardConfigModalProps {
  block: Block;
  onSave: (config: DashboardConfigState) => void;
  onCancel: () => void;
}

export default function DashboardConfigModal({ block, onSave, onCancel }: DashboardConfigModalProps) {
  const [dashboardType, setDashboardType] = useState<DashboardDataType>('pain');

  // Load existing config when modal opens
  useEffect(() => {
    if (block.dashboard?.type) {
      setDashboardType(block.dashboard.type);
    }
  }, [block]);

  const handleSave = () => {
    const config: DashboardConfigState = {};
    
    // Slider/BodyMap: pain oder function
    if (block.type === 'slider' || block.type === 'bodymap') {
      config.type = dashboardType;
    }
    
    // TextArea: Keine Config im Editor - wird im Diary konfiguriert
    
    onSave(config);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" 
      onClick={onCancel}
    >
      <Card 
        className="w-full max-w-lg" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-semibold">Dashboard-Konfiguration</h3>
          <Button onClick={onCancel} variant="ghost" size="icon">
            <X size={18} />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">{block.label}</Label>
            <p className="text-xs text-muted-foreground">
              Typ: {block.type === 'slider' ? 'Slider' : block.type === 'bodymap' ? 'Körperkarte' : block.type === 'textarea' ? 'Textfeld' : block.type}
            </p>
          </div>

          {/* Slider/BodyMap: Pain oder Function */}
          {(block.type === 'slider' || block.type === 'bodymap') && (
            <div className="space-y-3">
              <Label>Datentyp</Label>
              <div className="flex gap-2">
                <Button
                  onClick={() => setDashboardType('pain')}
                  variant={dashboardType === 'pain' ? 'default' : 'outline'}
                  className="flex-1"
                >
                  Schmerzwert
                </Button>
                <Button
                  onClick={() => setDashboardType('function')}
                  variant={dashboardType === 'function' ? 'default' : 'outline'}
                  className="flex-1"
                >
                  Funktionswert
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardType === 'pain' 
                  ? 'Wird als Schmerzlinie im Dashboard angezeigt' 
                  : 'Wird als Funktionslinie im Dashboard angezeigt (optional, später)'}
              </p>
            </div>
          )}

          {/* TextArea: Info dass Konfiguration im Diary erfolgt */}
          {block.type === 'textarea' && (
            <div className="space-y-3">
              <div className="p-4 bg-secondary/20 rounded-lg">
                <p className="text-sm">
                  ✅ Dashboard-Tracking aktiviert
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Beim Ausfüllen im Tagebuch kannst du wählen, ob der Eintrag als <strong>Event</strong> oder <strong>Arztbesuch</strong> markiert werden soll.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button onClick={onCancel} variant="outline">
            Abbrechen
          </Button>
          <Button onClick={handleSave}>
            Speichern
          </Button>
        </div>
      </Card>
    </div>
  );
}
