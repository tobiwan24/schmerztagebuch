// Sync-Status (Spec 04/10, SYN-14): synchronisiert / ausstehend n / offline / Fehler mit „Erneut versuchen".
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSync } from '@/data/SyncContext';
import { de } from '@/i18n/de';

export function SyncStatus() {
  const { state, pending, syncNow } = useSync();
  if (state === 'disabled') return null;
  const text =
    state === 'syncing' ? de.sync.syncing
    : state === 'synced' ? de.sync.synced
    : state === 'pending' ? de.sync.pending(pending)
    : state === 'offline' ? de.sync.offline(pending)
    : de.sync.error;
  const Icon = state === 'syncing' ? Loader2 : state === 'synced' ? CheckCircle2 : state === 'offline' ? CloudOff : state === 'error' ? AlertTriangle : RefreshCw;
  return (
    <div role="status" data-testid="sync-status" data-state={state} data-pending={pending} className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Icon className={state === 'syncing' ? 'size-3.5 animate-spin' : 'size-3.5'} aria-hidden />
        {text}
      </span>
      {state === 'error' ? (
        <Button size="sm" variant="ghost" className="-my-2 h-11 px-2 text-xs" onClick={() => void syncNow()}>
          {de.state.retry}
        </Button>
      ) : null}
    </div>
  );
}
