// shadcn/ui-Optik für ToggleGroup (Segment-Umschalter, ohne Radix): Buttons mit aria-pressed.
import * as React from 'react';
import { cn } from '@/lib/utils';

function ToggleGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div role="group" data-slot="toggle-group" className={cn('inline-flex w-full rounded-md border p-0.5 shadow-xs', className)} {...props} />;
}

function ToggleGroupItem({ className, pressed, ...props }: Omit<React.ComponentProps<'button'>, 'type'> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-slot="toggle-group-item"
      className={cn(
        'inline-flex h-10 flex-1 items-center justify-center rounded-sm px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        pressed ? 'bg-primary text-primary-foreground' : 'hover:bg-accent hover:text-accent-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
