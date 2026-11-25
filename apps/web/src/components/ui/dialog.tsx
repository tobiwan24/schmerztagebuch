// shadcn/ui-Optik für Dialoge (ohne Radix): natives <dialog> mit showModal() — Fokusfalle, Esc und Backdrop vom Browser.
import * as React from 'react';
import { cn } from '@/lib/utils';

function Dialog({ open, onClose, className, children, ...props }: React.ComponentProps<'dialog'> & { open: boolean; onClose: () => void }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      data-slot="dialog"
      onClose={onClose}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-sm rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/50',
        className,
      )}
      {...props}
    >
      {open ? children : null}
    </dialog>
  );
}

function DialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 data-slot="dialog-title" className={cn('text-lg font-semibold', className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="dialog-description" className={cn('mt-2 text-sm text-muted-foreground', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export { Dialog, DialogTitle, DialogDescription, DialogFooter };
