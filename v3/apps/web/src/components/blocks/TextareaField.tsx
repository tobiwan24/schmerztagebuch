// Textarea-Block im Eintragsformular (Port v2 `TextAreaBlock`, BLK-31): Text, Ereignisse/Arztbesuche mit Titel,
// Foto/PDF anhängen (Bildvorschau) und entfernen. Dateien liegen bis zum Speichern im Speicher des Formulars (BLK-30).
import { useRef, useState } from 'react';
import { CalendarPlus, FileText, Paperclip, Stethoscope, X } from 'lucide-react';
import type { TextareaConfig, TextareaValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { de } from '@/i18n/de';

export interface AttachmentItem {
  id: string;
  name: string;
  kind: 'image' | 'pdf';
  /** Vorschau (nur Bilder, nur solange die Datei im Formular liegt). */
  previewUrl?: string;
}

/** Vom Formular bereitgestellt: Dateien werden erst beim Speichern geschrieben. */
export interface AttachmentApi {
  info(id: string): AttachmentItem | undefined;
  /** Datei annehmen; liefert die neue Anhang-ID oder den Ablehnungsgrund. */
  add(file: File): Promise<{ id: string } | { error: 'tooLarge' | 'type' }>;
  remove(id: string): void;
}

type Category = 'event' | 'doctor';

export function TextareaField({
  id, config, value, onChange, aria, attachments, newId,
}: {
  id: string;
  config: TextareaConfig;
  value: TextareaValue | undefined;
  onChange: (v: TextareaValue) => void;
  aria: Record<string, unknown>;
  attachments?: AttachmentApi;
  newId?: () => string;
}) {
  const v = value ?? {};
  // Dateien werden asynchron gelesen: danach gilt der zuletzt gerenderte Wert, nicht der beim Auswählen.
  const latest = useRef(v);
  latest.current = v;
  const [adding, setAdding] = useState<Category | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const events = v.events ?? [];
  const ids = v.attachmentIds ?? [];

  const closeAdd = () => {
    setAdding(null);
    setTitle('');
  };
  const addEvent = () => {
    const t = title.trim();
    if (!t || !adding || !newId) return;
    onChange({ ...v, events: [...events, { id: newId(), category: adding, title: t }] });
    closeAdd();
  };
  const removeEvent = (eid: string) => {
    const next = events.filter((e) => e.id !== eid);
    onChange({ ...v, events: next.length ? next : undefined });
  };
  async function onFiles(files: FileList | null) {
    if (!attachments || !files) return;
    setError(null);
    for (const file of Array.from(files)) {
      const r = await attachments.add(file);
      if ('error' in r) setError(r.error === 'tooLarge' ? de.entry.attachmentTooLarge(file.name) : de.entry.attachmentType(file.name));
      else {
        const cur = latest.current;
        latest.current = { ...cur, attachmentIds: [...(cur.attachmentIds ?? []), r.id] };
        onChange(latest.current);
      }
    }
  }
  const removeAttachment = (aid: string) => {
    attachments?.remove(aid);
    const next = ids.filter((x) => x !== aid);
    onChange({ ...v, attachmentIds: next.length ? next : undefined });
  };

  return (
    <div className="flex flex-col gap-3">
      <Textarea id={id} value={v.text ?? ''} onChange={(e) => onChange({ ...v, text: e.target.value || undefined })} {...aria} />

      {config.allowEvents ? (
        <div className="flex flex-col gap-2">
          {events.length ? (
            <ul className="flex flex-col gap-1" aria-label={de.entry.eventsHeading}>
              {events.map((e) => (
                <li key={e.id} data-testid="event-item" className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  {e.category === 'doctor' ? <Stethoscope aria-hidden className="size-4 shrink-0" /> : <CalendarPlus aria-hidden className="size-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{e.category === 'doctor' ? de.entry.categoryDoctor : de.entry.categoryEvent}: </span>
                    {e.title}
                  </span>
                  <Button type="button" variant="ghost" size="icon" aria-label={de.entry.eventRemove(e.title)} onClick={() => removeEvent(e.id)}>
                    <X aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {adding ? (
            <div className="flex flex-col gap-2" role="group" aria-label={adding === 'doctor' ? de.entry.addDoctor : de.entry.addEvent}>
              <Input
                autoFocus aria-label={de.entry.eventTitle} placeholder={de.entry.eventTitle} value={title} maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEvent();
                  }
                  if (e.key === 'Escape') closeAdd();
                }}
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={!title.trim()} onClick={addEvent}>
                  {de.entry.eventAdd}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={closeAdd}>
                  {de.entry.eventCancel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setAdding('event')}>
                <CalendarPlus aria-hidden />
                {de.entry.addEvent}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAdding('doctor')}>
                <Stethoscope aria-hidden />
                {de.entry.addDoctor}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {config.allowAttachments && attachments ? (
        <div className="flex flex-col gap-2">
          {ids.length ? (
            <ul className="flex flex-col gap-2" aria-label={de.entry.attachments}>
              {ids.map((aid) => {
                const item = attachments.info(aid);
                return (
                  <li key={aid} data-testid="attachment-item" className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    {item?.previewUrl ? (
                      <img src={item.previewUrl} alt={de.entry.attachmentPreview(item.name)} className="size-12 shrink-0 rounded object-cover" />
                    ) : (
                      <FileText aria-hidden className="size-5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item?.name ?? aid}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label={de.entry.attachmentRemove(item?.name ?? aid)} onClick={() => removeAttachment(aid)}>
                      <X aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Input
            ref={fileInput} type="file" multiple accept="image/*,application/pdf" className="hidden" aria-label={de.entry.attachFileInput}
            onChange={(e) => void onFiles(e.target.files).finally(() => (e.target.value = ''))}
          />
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => fileInput.current?.click()}>
            <Paperclip aria-hidden />
            {de.entry.attachFile}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
