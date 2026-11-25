// shadcn/ui Chart (Recharts-Hülle, angelehnt an shadcn `chart.tsx`): Container mit fester Höhe und Farb-Variablen aus der
// Konfiguration (`--color-<key>`), damit Diagramme die Theme-Tokens nutzen und hell/dunkel funktionieren.
import * as React from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

export type ChartConfig = Record<string, { label: string; color: string }>;

const ChartContext = React.createContext<ChartConfig | null>(null);
export const useChartConfig = () => React.useContext(ChartContext) ?? {};

function ChartContainer({ config, className, children, ...props }: React.ComponentProps<'div'> & { config: ChartConfig; children: React.ReactElement }) {
  const vars = Object.fromEntries(Object.entries(config).map(([k, v]) => [`--color-${k}`, v.color])) as React.CSSProperties;
  return (
    <ChartContext.Provider value={config}>
      <div data-slot="chart" className={cn('h-56 w-full text-xs [&_.recharts-cartesian-grid_line]:stroke-border [&_.recharts-text]:fill-muted-foreground', className)} style={vars} {...props}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

/** Tooltip-Inhalt im shadcn-Stil (Recharts übergibt `active`, `payload`, `label`). */
function ChartTooltipContent({ active, payload, label, formatter }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: string; formatter?: (v: number | string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
      {label ? <p className="mb-1 font-medium">{label}</p> : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[var(--dot)]" style={{ '--dot': p.color } as React.CSSProperties} />
          {p.name}: <span className="font-semibold tabular-nums">{formatter && p.value !== undefined ? formatter(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

export { ChartContainer, ChartTooltipContent };
