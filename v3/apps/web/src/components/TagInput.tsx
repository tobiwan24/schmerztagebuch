// Tags eines Eintrags erfassen (BLK-29): Enter, Komma oder Vorschlag fügen hinzu, × entfernt. Regeln in `@stb/core` (BLK-28).
import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { addTag, suggestTags, MAX_TAGS, MAX_TAG_LENGTH } from '@stb/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { de } from '@/i18n/de';

export function TagInput({ tags, onChange, known }: { tags: readonly string[]; onChange: (tags: string[]) => void; known: readonly (readonly string[])[] }) {
  const id = useId();
  const [text, setText] = useState('');
  const full = tags.length >= MAX_TAGS;

  /** Übernimmt eine Eingabe (auch mehrere, durch Komma getrennt). */
  function commit(raw: string) {
    let next = [...tags];
    for (const part of raw.split(',')) next = addTag(next, part);
    if (next.length !== tags.length) onChange(next);
    setText('');
  }
  function onInput(value: string) {
    if (!value.includes(',')) return setText(value);
    const i = value.lastIndexOf(',');
    commit(value.slice(0, i));
    setText(value.slice(i + 1));
  }
  const suggestions = full ? [] : suggestTags(known, text, tags);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{de.entry.tags}</Label>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={de.entry.tagsSet}>
          {tags.map((t) => (
            <li key={t}>
              <Badge data-testid="tag-chip" className="gap-1 pr-1">
                {t}
                <Button type="button" variant="ghost" size="icon" className="size-6" aria-label={de.entry.tagRemove(t)} onClick={() => onChange(tags.filter((x) => x !== t))}>
                  <X aria-hidden />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id} value={text} maxLength={MAX_TAG_LENGTH + 1} disabled={full} placeholder={full ? de.entry.tagsFull : de.entry.tagsPlaceholder}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault(); // Enter im Tag-Feld speichert nicht den Eintrag
            commit(text);
          }
        }}
      />
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={de.entry.tagSuggestions}>
          {suggestions.map((s) => (
            <Button key={s} type="button" size="sm" variant="outline" onClick={() => commit(s)}>
              {s}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
