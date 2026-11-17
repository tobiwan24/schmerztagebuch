// Dialog „Neu in Version x“ nach einem Update (UI-27). Wird erst bei einem Versionssprung nachgeladen (siehe WhatsNewGate).
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { ReleaseList } from '@/components/ReleaseList';
import { changelog } from '@/data/changelog';
import { unseenReleases } from '@/data/whats-new';
import { writeLastSeen } from '@/data/whats-new-state';
import { APP_VERSION } from '@/version';
import { deWhatsNew } from '@/i18n/lazy/whatsNew';

export default function WhatsNewDialog({ lastSeen }: { lastSeen: string | null }) {
  const [open, setOpen] = useState(true);
  const unseen = unseenReleases(changelog, lastSeen, APP_VERSION);
  // Nichts Neues zu zeigen (z. B. Version ohne Eintrag): stillschweigend merken.
  useEffect(() => {
    if (unseen.length === 0) writeLastSeen(APP_VERSION);
  }, [unseen.length]);
  if (unseen.length === 0) return null;
  const close = () => {
    writeLastSeen(APP_VERSION);
    setOpen(false);
  };
  return (
    <Dialog open={open} onClose={close} aria-labelledby="whats-new-title" data-testid="whats-new-dialog" className="max-h-[80dvh] overflow-y-auto">
      <DialogTitle id="whats-new-title">{deWhatsNew.title(unseen[0]!.version)}</DialogTitle>
      <div className="mt-4">
        <ReleaseList releases={unseen} testId="whats-new-unseen" />
      </div>
      <DialogFooter>
        <Button onClick={close}>{deWhatsNew.close}</Button>
      </DialogFooter>
    </Dialog>
  );
}
