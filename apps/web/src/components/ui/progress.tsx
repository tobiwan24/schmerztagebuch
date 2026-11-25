import * as React from 'react';
import { cn } from '@/lib/utils';

/** shadcn/ui Progress (ohne Radix): Balken mit `role="progressbar"`. */
function Progress({ className, value, max = 100, ...props }: React.ComponentProps<'div'> & { value: number; max?: number }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div data-slot="progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)} {...props}>
      <div data-slot="progress-indicator" className="bg-primary h-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export { Progress };
