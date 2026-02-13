import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Block } from '../types/blocks';

interface BulkActionsPanelProps {
  blocks: Block[];
  onToggleAllDashboard: () => void;
  onToggleAllLabels: () => void;
}

export default function BulkActionsPanel({ 
  blocks, 
  onToggleAllDashboard, 
  onToggleAllLabels 
}: BulkActionsPanelProps) {
  // Zähle Blocks die Dashboard nutzen können
  const dashboardCapableBlocks = blocks.filter(b => 
    ['slider', 'bodymap', 'textarea', 'multiselect'].includes(b.type)
  );
  
  const dashboardEnabledCount = dashboardCapableBlocks.filter(b => 
    b.dashboard?.enabled
  ).length;
  
  const labelsHiddenCount = blocks.filter(b => b.hideLabelInDiary).length;
  
  // Indeterminate State (einige aber nicht alle)
  const isDashboardIndeterminate = dashboardEnabledCount > 0 && 
    dashboardEnabledCount < dashboardCapableBlocks.length;
  
  const isLabelsIndeterminate = labelsHiddenCount > 0 && 
    labelsHiddenCount < blocks.length;
  
  const allDashboardEnabled = dashboardEnabledCount === dashboardCapableBlocks.length && 
    dashboardCapableBlocks.length > 0;
  
  const allLabelsHidden = labelsHiddenCount === blocks.length && blocks.length > 0;

  if (blocks.length === 0) return null;

  return (
    <Card className="p-3 bg-secondary/30 border-dashed bulk-actions-panel">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Alle in Dashboard</Label>
            <p className="text-xs text-muted-foreground">
              {dashboardEnabledCount} von {dashboardCapableBlocks.length} aktiv
            </p>
          </div>
          <Checkbox
            checked={allDashboardEnabled}
            onCheckedChange={onToggleAllDashboard}
            className={`${isDashboardIndeterminate ? 'opacity-60' : ''} w-5 h-5`}
          />
        </div>

        <div className="h-px bg-border" />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Alle Labels ausblenden</Label>
            <p className="text-xs text-muted-foreground">
              {labelsHiddenCount} von {blocks.length} ausgeblendet
            </p>
          </div>
          <Checkbox
            checked={allLabelsHidden}
            onCheckedChange={onToggleAllLabels}
            className={`${isLabelsIndeterminate ? 'opacity-60' : ''} w-5 h-5`}
          />
        </div>
      </div>
    </Card>
  );
}
