// shadcn/ui-Optik für Checkboxen (ohne Radix-Abhängigkeit: natives Element, Größe 20 px, Klickfläche über das Label).
import * as React from 'react';
import { cn } from '@/lib/utils';

function Checkbox({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        'peer size-5 shrink-0 rounded-[4px] border border-input accent-primary shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Checkbox };
