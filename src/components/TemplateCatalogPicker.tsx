import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, Check } from 'lucide-react';
import { TEMPLATE_CATALOG } from '../data/templateCatalog';
import { getIconComponent } from '../utils/iconUtils';

interface TemplateCatalogPickerProps {
  /** single: Einzelauswahl (EditorMode) – gibt eine ID oder null zurück */
  mode: 'single' | 'multi';
  /** Callback bei Einzelauswahl */
  onSelectSingle?: (catalogId: string | null) => void;
  /** Callback bei Mehrfachauswahl – gibt Array der gewählten IDs zurück (leer = nur Datum+Notizen) */
  onSelectMulti?: (catalogIds: string[]) => void;
  /** Zeige "Leer starten"-Option (Standard: true) */
  showEmpty?: boolean;
}

export default function TemplateCatalogPicker({
  mode,
  onSelectSingle,
  onSelectMulti,
  showEmpty = true,
}: TemplateCatalogPickerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function handleToggle(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (mode === 'single') {
    return (
      <div className="space-y-2">
        {showEmpty && (
          <button
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/40 transition-colors text-left"
            onClick={() => onSelectSingle?.(null)}
          >
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
              <Plus size={20} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Leer starten</p>
              <p className="text-xs text-muted-foreground">Datum + Notizen</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
          </button>
        )}

        {TEMPLATE_CATALOG.map((entry) => {
          const Icon = getIconComponent(entry.icon);
          return (
            <button
              key={entry.id}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-secondary/40 transition-colors text-left"
              onClick={() => onSelectSingle?.(entry.id)}
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                <Icon size={20} className="text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.name}</p>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground flex-shrink-0" />
            </button>
          );
        })}
      </div>
    );
  }

  // Multi-Select Modus
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {TEMPLATE_CATALOG.map((entry) => {
          const Icon = getIconComponent(entry.icon);
          const isSelected = selectedIds.has(entry.id);
          return (
            <button
              key={entry.id}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-colors text-left ${
                isSelected
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => handleToggle(entry.id)}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isSelected ? 'bg-primary/10' : 'bg-secondary'
              }`}>
                <Icon size={20} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.name}</p>
                <p className="text-xs text-muted-foreground">{entry.description}</p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                isSelected ? 'border-primary bg-primary' : 'border-border'
              }`}>
                {isSelected && <Check size={14} className="text-white" />}
              </div>
            </button>
          );
        })}
      </div>

      <Button
        className="w-full"
        onClick={() => onSelectMulti?.(Array.from(selectedIds))}
      >
        {selectedIds.size === 0
          ? 'Ohne Vorlage starten'
          : `${selectedIds.size} Vorlage${selectedIds.size > 1 ? 'n' : ''} anlegen`}
      </Button>
    </div>
  );
}
