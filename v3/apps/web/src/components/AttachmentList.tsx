// Anhänge eines Eintrags (A-032): Name, Größe, „Öffnen". Inhalt lokal oder — auf einem anderen Gerät — vom Server.
import { useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import type { AttachmentMeta } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useData } from '@/data/DataContext';
import { useSync } from '@/data/SyncContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function openBytes(bytes: Uint8Array<ArrayBuffer>, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function AttachmentList({ ids }: { ids: readonly string[] }) {
  const { attachments } = useData();
  const sync = useSync();
  const [missing, setMissing] = useState<string | null>(null);
  const query = useQuery(async () => (await Promise.all(ids.map((id) => attachments.get(id)))).filter((m): m is AttachmentMeta => !!m), [attachments, ids.join(',')]);
  if (query.status !== 'ok' || !query.data.length) return null;

  async function open(m: AttachmentMeta) {
    setMissing(null);
    let bytes = await attachments.data(m.id);
    if (!bytes) {
      bytes = await sync.fetchBlob(m.diaryId, m.id).catch(() => undefined);
      if (bytes) await attachments.storeDownloaded(m.id, bytes);
    }
    if (bytes) openBytes(bytes, m.mime);
    else setMissing(m.id);
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
            <Button variant="outline" size="sm" onClick={() => void open(m)}>
              {de.entry.openAttachment}
            </Button>
          </div>
        ))}
      </Card>
    </section>
  );
}
