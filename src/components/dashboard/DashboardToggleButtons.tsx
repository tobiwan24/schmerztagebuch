import { Button } from "@/components/ui/button";
import { BarChart3 } from 'lucide-react';
import type { Block } from '../../types/blocks';

interface DashboardToggleButtonsProps {
  block: Block;
  onToggle: (blockId: string) => void;
}

export default function DashboardToggleButtons({ 
  block, 
  onToggle
}: DashboardToggleButtonsProps) {
  const canUseDashboard = ['slider', 'bodymap', 'textarea', 'multiselect'].includes(block.type);
  const isDashboardEnabled = block.dashboard?.enabled || false;

  if (!canUseDashboard) return null;

  return (
    <Button 
      onClick={() => onToggle(block.id)} 
      variant="ghost"
      size="icon"
      className={`btn-touch-target ${isDashboardEnabled ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}`}
      title={isDashboardEnabled ? "Im Dashboard anzeigen" : "Nicht im Dashboard"}
    >
      <BarChart3 size={20} />
    </Button>
  );
}