// Anhänge eines Eintrags (A-032): Name, Größe, „Öffnen". Inhalt lokal oder — auf einem anderen Gerät — vom Server.
// Anzeige im Dialog der App statt in einem neuen Fenster: iOS blockiert window.open/_blank nach einem await stumm.
import { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import type { AttachmentMeta } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { useData } from '@/data/DataContext';
import { useSync } from '@/data/SyncContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function AttachmentList({ ids }: { ids: readonly string[] }) {
  const { attachments } = useData();
  const sync = useSync();
  const [missing, setMissing] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ meta: AttachmentMeta; url: string } | null>(null);
  const query = useQuery(async () => (await Promise.all(ids.map((id) => attachments.get(id)))).filter((m): m is AttachmentMeta => !!m), [attachments, ids.join(',')]);

  // Object-URL beim Schließen/Unmount freigeben.
  useEffect(() => {
    const url = viewing?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [viewing]);

  if (query.status !== 'ok' || !query.data.length) return null;

  async function open(m: AttachmentMeta) {
    setMissing(null);
    setLoading(m.id);
    try {
      let bytes = await attachments.data(m.id);
      if (!bytes) {
        bytes = await sync.fetchBlob(m.diaryId, m.id).catch(() => undefined);
        if (bytes) await attachments.storeDownloaded(m.id, bytes);
      }
      if (bytes) setViewing({ meta: m, url: URL.createObjectURL(new Blob([bytes], { type: m.mime })) });
      else setMissing(m.id);
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="flex flex-col gap-2" data-testid="attachments">
      <h2 className="text-sm font-medium text-muted-foreground">{de.entry.attachments}</h2>
      <Card className="gap-0 py-0">
        {query.data.map((m) => (
          <div key={m.id} data-testid="attachment" className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
            {m.kind === 'pdf' ? <FileText aria-hidden className="size-4 shrink-0" /> : <ImageIcon aria-hidden className="size-4 shrink-0" />}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{m.name}</span>
              <span className="text-xs text-muted-foreground">
                {size(m.sizeBytes)}
                {missing === m.id ? ` · ${de.entry.attachmentUnavailable}` : ''}
              </span>
            </div>
            <Button variant="outline" size="sm" disabled={loading === m.id} onClick={() => void open(m)}>
              {loading === m.id ? de.entry.attachmentLoading : de.entry.openAttachment}
            </Button>
          </div>
        ))}
      </Card>
      <Dialog open={!!viewing} onClose={() => setViewing(null)} aria-labelledby="attachment-view-title" className="max-w-2xl" data-testid="attachment-dialog">
        {viewing && (
          <>
            <DialogTitle id="attachment-view-title" className="truncate">
              {viewing.meta.name}
            </DialogTitle>
            {viewing.meta.kind === 'image' ? (
              <img src={viewing.url} alt={viewing.meta.name} className="mt-4 max-h-[80vh] w-full object-contain" />
            ) : (
              <>
                <DialogDescription>{de.entry.attachmentPdfHint}</DialogDescription>
                <Button asChild className="mt-4 w-full">
                  <a href={viewing.url} target="_blank" rel="noopener">
                    {de.entry.attachmentOpenPdf}
                  </a>
                </Button>
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewing(null)}>
                {de.entry.attachmentClose}
              </Button>
            </DialogFooter>
          </>
        )}
      </Dialog>
    </section>
  );
}
