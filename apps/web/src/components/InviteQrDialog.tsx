// QR-Einladung anzeigen (RDM-032, Spec 09): Der Owner zeigt den Code `<id>.<secret>` als QR-Code, die eingeladene
// Person scannt ihn in der installierten App. Die Einladung gilt 10 Minuten und nur einmal; Schließen des Dialogs oder
// Wechsel der App in den Hintergrund widerruft sie. Solange der Dialog offen ist, wird die Annahme abgefragt und
// per Sync bestätigt (HMAC-Prüfung wie beim Link, SHR-03).
import { useEffect, useRef, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { qrMatrix, type QrMatrix } from '@/lib/qr';
import { deMembers } from '@/i18n/lazy/members';

const t = deMembers.qr;
export const QR_POLL_MS = 3000;

type PollResult = { status: 'waiting' } | { status: 'joined'; username: string | null } | { status: 'failed' };

interface InviteQrDialogProps {
  role: 'editor' | 'viewer';
  create: (role: 'editor' | 'viewer') => Promise<{ id: string; code: string }>;
  poll: (invitationId: string) => Promise<PollResult>;
  revoke: (invitationId: string) => Promise<void>;
  onClose: () => void;
}

export function InviteQrDialog({ role, create, poll, revoke, onClose }: InviteQrDialogProps) {
  const [qr, setQr] = useState<QrMatrix | null>(null);
  const [state, setState] = useState<{ kind: 'loading' | 'waiting' | 'failed' | 'error' } | { kind: 'joined'; username: string | null }>({ kind: 'loading' });
  const invitation = useRef<{ id: string; done: boolean } | null>(null);
  const handlers = useRef({ create, poll, revoke, onClose });
  useEffect(() => {
    handlers.current = { create, poll, revoke, onClose };
  });

  // Einladung anlegen; beim Schließen (Unmount) widerrufen, außer sie wurde angenommen.
  useEffect(() => {
    let closed = false;
    async function start() {
      try {
        const inv = await handlers.current.create(role);
        if (closed) return void handlers.current.revoke(inv.id).catch(() => undefined);
        invitation.current = { id: inv.id, done: false };
        setQr(await qrMatrix(inv.code));
        setState({ kind: 'waiting' });
      } catch {
        if (!closed) setState({ kind: 'error' });
      }
    }
    void start();
    return () => {
      closed = true;
      const inv = invitation.current;
      invitation.current = null;
      if (inv && !inv.done) void handlers.current.revoke(inv.id).catch(() => undefined);
    };
  }, [role]);

  // App in den Hintergrund → Code ungültig machen (Dialog schließt, Unmount widerruft).
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handlers.current.onClose();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Annahme abfragen.
  useEffect(() => {
    if (state.kind !== 'waiting') return;
    let busy = false;
    const timer = setInterval(() => {
      const inv = invitation.current;
      if (!inv || busy) return;
      busy = true;
      void handlers.current
        .poll(inv.id)
        .then((r) => {
          if (r.status === 'joined') {
            inv.done = true;
            setState({ kind: 'joined', username: r.username });
          } else if (r.status === 'failed') setState({ kind: 'failed' });
        })
        .catch(() => undefined)
        .finally(() => (busy = false));
    }, QR_POLL_MS);
    return () => clearInterval(timer);
  }, [state.kind]);

  return (
    <Dialog open onClose={onClose} aria-labelledby="invite-qr-title" data-testid="invite-qr-dialog">
      <DialogTitle id="invite-qr-title">{t.title}</DialogTitle>
      <DialogDescription>{t.hint}</DialogDescription>
      {state.kind === 'waiting' && qr ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          <svg
            data-testid="invite-qr"
            role="img"
            aria-label={t.alt}
            viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`}
            shapeRendering="crispEdges"
            className="size-64 max-w-full rounded-md bg-white"
          >
            <path d={qr.path} className="fill-black" />
          </svg>
          <span className="text-xs text-muted-foreground">{t.waiting}</span>
        </div>
      ) : null}
      {state.kind === 'loading' ? <p className="mt-4 text-sm text-muted-foreground">{t.loading}</p> : null}
      {state.kind === 'joined' ? (
        <p data-testid="invite-qr-joined" className="mt-4 flex items-center gap-2 text-sm">
          <CircleCheck aria-hidden className="size-5 text-primary" />
          {state.username ? t.joined(state.username) : t.joinedAnon}
        </p>
      ) : null}
      {state.kind === 'failed' ? <p role="alert" className="mt-4 text-sm text-destructive">{t.failed}</p> : null}
      {state.kind === 'error' ? <p role="alert" className="mt-4 text-sm text-destructive">{deMembers.error}</p> : null}
      <DialogFooter>
        <Button variant={state.kind === 'joined' ? 'default' : 'outline'} onClick={onClose}>
          {state.kind === 'joined' ? t.done : t.close}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
