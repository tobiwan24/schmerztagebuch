import { Button } from "@/components/ui/button";
import { BarChart3, Settings } from 'lucide-react';
import type { Block } from '../../types/blocks';

interface DashboardToggleButtonsProps {
  block: Block;
  onToggle: (blockId: string) => void;
  onConfigure: (blockId: string) => void;
}

export default function DashboardToggleButtons({ 
  block, 
  onToggle, 
  onConfigure 
}: DashboardToggleButtonsProps) {
  // Welche Block-Typen können Dashboard nutzen?
  const canUseDashboard = ['slider', 'bodymap', 'textarea', 'multiselect'].includes(block.type);
  const isDashboardEnabled = block.dashboard?.enabled || false;
  
  // Nur Slider/BodyMap brauchen Config-Button (für pain vs function)
  const needsConfig = ['slider', 'bodymap'].includes(block.type);

  if (!canUseDashboard) return null;

  return (
    <>
      <Button 
        onClick={() => onToggle(block.id)} 
        variant={isDashboardEnabled ? "ghost" : "ghost"}
        size="icon"
        className={`btn-touch-target ${isDashboardEnabled ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
        title={isDashboardEnabled ? "Im Dashboard anzeigen" : "Nicht im Dashboard"}
      >
        <BarChart3 size={16} />
      </Button>
      {isDashboardEnabled && needsConfig && (
        <Button 
          onClick={() => onConfigure(block.id)}
          variant="ghost"
          size="icon"
          className="btn-touch-target"
          title="Dashboard konfigurieren"
        >
          <Settings size={14} />
        </Button>
      )}
    </>
  );
}