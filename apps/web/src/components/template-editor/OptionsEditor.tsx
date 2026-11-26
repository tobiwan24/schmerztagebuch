// Optionen eines Auswahl-Blocks im Vorlagen-Editor (BLK-24): hinzufügen, umbenennen, entfernen, Farbe, Reihenfolge
// per Ziehen (Pointer) und Tastatur (Pfeil hoch/runter am Griff), Muster wie die Vorlagenliste.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { OPTION_COLORS } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { deTemplates } from '@/i18n/lazy/templates';

const t = deTemplates.editor.multiselect;

export interface OptionDef {
  id: string;
  label: string;
  /** Kurzname für den Kurzbefehl (FEAT-024), optional. */
  short?: string;
  color: string;
}

/** Tailwind-Klassen je Palettenfarbe (statisch, damit sie im Build erhalten bleiben). */
export const SWATCH: Record<(typeof OPTION_COLORS)[number], string> = {
  '#ef4444': 'bg-red-500 hover:bg-red-500',
  '#f97316': 'bg-orange-500 hover:bg-orange-500',
  '#eab308': 'bg-yellow-500 hover:bg-yellow-500',
  '#22c55e': 'bg-green-500 hover:bg-green-500',
  '#06b6d4': 'bg-cyan-500 hover:bg-cyan-500',
  '#3b82f6': 'bg-blue-500 hover:bg-blue-500',
  '#8b5cf6': 'bg-violet-500 hover:bg-violet-500',
  '#ec4899': 'bg-pink-500 hover:bg-pink-500',
};

function moveTo(list: OptionDef[], id: string, target: number): OptionDef[] {
  const from = list.findIndex((o) => o.id === id);
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(target, next.length)), 0, item!);
  return next;
}

export function OptionsEditor({
  blockId, options, newId, onChange,
}: { blockId: string; options: OptionDef[]; newId: () => string; onChange: (options: OptionDef[]) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const patch = (id: string, p: Partial<OptionDef>) => onChange(options.map((o) => (o.id === id ? { ...o, ...p } : o)));
  /** Leerer Kurzname entfernt das Feld (kein leerer String in der Vorlage). */
  const setShort = (id: string, value: string) =>
    onChange(
      options.map((o) => {
        if (o.id !== id) return o;
        const { short: _drop, ...rest } = o;
        void _drop;
        return value.trim() ? { ...rest, short: value } : rest;
      }),
    );

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (!dragId) return;
    const others = options.filter((o) => o.id !== dragId);
    let target = others.length;
    for (let i = 0; i < others.length; i++) {
      const rect = refs.current.get(others[i]!.id)?.getBoundingClientRect();
      if (rect && e.clientY < rect.top + rect.height / 2) {
        target = i;
        break;
      }
    }
    if (options.findIndex((o) => o.id === dragId) !== target) onChange(moveTo(options, dragId, target));
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const from = options.findIndex((o) => o.id === id);
    onChange(moveTo(options, id, from + (e.key === 'ArrowUp' ? -1 : 1)));
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={t.options}>
      <p className="text-sm font-medium">{t.options}</p>
      {options.map((o, i) => (
        <div
          key={o.id}
          ref={(el) => {
            if (el) refs.current.set(o.id, el);
            else refs.current.delete(o.id);
          }}
          data-testid="option-row"
          className={cn('flex flex-col gap-2 rounded-md border p-2', dragId === o.id && 'bg-accent')}
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="cursor-grab touch-none"
              aria-label={t.move(o.label || String(i + 1))}
              aria-description={t.moveHint}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragId(o.id);
              }}
              onPointerMove={onPointerMove}
              onPointerUp={() => setDragId(null)}
              onPointerCancel={() => setDragId(null)}
              onKeyDown={(e) => onKeyDown(e, o.id)}
            >
              <GripVertical aria-hidden />
            </Button>
            <Input
              id={`block-${blockId}-option-${o.id}`}
              aria-label={t.optionLabel(i + 1)}
              value={o.label}
              onChange={(e) => patch(o.id, { label: e.target.value })}
            />
            <Button type="button" variant="ghost" size="icon" aria-label={t.remove(o.label || String(i + 1))} onClick={() => onChange(options.filter((x) => x.id !== o.id))}>
              <Trash2 aria-hidden />
            </Button>
          </div>
          <Input
            id={`block-${blockId}-option-${o.id}-short`}
            aria-label={t.shortLabel(i + 1)}
            placeholder={t.shortPlaceholder}
            value={o.short ?? ''}
            onChange={(e) => setShort(o.id, e.target.value)}
          />
          <div className="flex flex-wrap gap-1 pl-1" role="group" aria-label={t.color(o.label || String(i + 1))}>
            {OPTION_COLORS.map((c) => (
              <Button
                key={c}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.colorNames[c]}
                aria-pressed={o.color === c}
                onClick={() => patch(o.id, { color: c })}
                className={cn('size-7 rounded-full border-2 border-transparent p-0', SWATCH[c], o.color === c && 'border-foreground')}
              />
            ))}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...options, { id: newId(), label: t.defaultLabel(options.length + 1), color: OPTION_COLORS[options.length % OPTION_COLORS.length]! }])}
      >
        <Plus aria-hidden />
        {t.add}
      </Button>
    </div>
  );
}
