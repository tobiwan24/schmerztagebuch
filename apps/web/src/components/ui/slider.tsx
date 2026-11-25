// shadcn/ui-Optik für Slider (ohne Radix: natives range-Input, Akzentfarbe aus den Tokens, Touch-Höhe 44 px).
import * as React from 'react';
import { cn } from '@/lib/utils';

function Slider({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="range"
      data-slot="slider"
      className={cn('h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:accent-destructive', className)}
      {...props}
    />
  );
}

export { Slider };
