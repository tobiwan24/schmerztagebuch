// Blockliste des Vorlagen-Editors (Spec 05 „Vorlagen-Editor"): Palette, Bezeichnung, Beschreibung, Pflicht, Rolle und
// typabhängige Konfiguration. Typwechsel wird nicht angeboten (DM-07); Umsortieren/Entfernen folgen (M14.5).
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { ROLES, moveBlock, newBlock, removeBlock, setHideLabel, type BlockDef, type BlockType, type Role } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';
import { BlockConfigFields } from './BlockConfigFields';

const t = de.templates.editor;
/** Block-Typen der Palette. */
const PALETTE: readonly BlockType[] = ['slider', 'checkbox', 'multiselect', 'text', 'textarea', 'date', 'bodymap', 'medication'];

export function BlockEditor({
  blocks, issues, newId, onChange, quickIds, onQuickChange,
}: {
  /** Nach `order` sortiert. */
  blocks: BlockDef[];
  /** Fehlermeldungen je Block-ID (nach dem ersten Speicherversuch). */
  issues: Map<string, string[]>;
  newId: () => string;
  onChange: (blocks: BlockDef[]) => void;
  /** Blöcke im Schnelleintrag (A-070); unversioniert, daher getrennt von `blocks`. */
  quickIds: readonly string[];
  onQuickChange: (id: string, on: boolean) => void;
}) {
  const replace = (next: BlockDef) => onChange(blocks.map((b) => (b.id === next.id ? next : b)));
  const [dragId, setDragId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());

  /** Ziehen: Zielposition aus der Zeigerhöhe relativ zu den Kartenmitten der übrigen Felder; jeder Zwischenstand ist gültig. */
  function onDrag(e: PointerEvent<HTMLButtonElement>) {
    if (!dragId) return;
    const others = blocks.filter((b) => b.id !== dragId);
    let target = others.length;
    for (let i = 0; i < others.length; i++) {
      const rect = refs.current.get(others[i]!.id)?.getBoundingClientRect();
      if (rect && e.clientY < rect.top + rect.height / 2) {
        target = i;
        break;
      }
    }
    if (blocks.findIndex((b) => b.id === dragId) !== target) onChange(moveBlock(blocks, dragId, target));
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    onChange(moveBlock(blocks, id, blocks.findIndex((b) => b.id === id) + (e.key === 'ArrowUp' ? -1 : 1)));
  }
  return (
    <section className="flex flex-col gap-3" aria-labelledby="blocks-heading">
      <h2 id="blocks-heading" className="text-sm font-medium">
        {t.blocks}
      </h2>
      <p className="text-xs text-muted-foreground">{t.blocksHint}</p>
      <p className="text-xs text-muted-foreground">{t.quickHint}</p>
      {blocks.length > 0 ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(setHideLabel(blocks, !blocks.every((b) => b.hideLabel === true)))}>
          {blocks.every((b) => b.hideLabel === true) ? t.showAllLabels : t.hideAllLabels}
        </Button>
      ) : null}
      {blocks.length === 0 ? <p className="text-sm text-muted-foreground">{t.noBlocks}</p> : null}
      {blocks.map((b, i) => (
        <BlockCard
          key={b.id}
          def={b}
          index={i + 1}
          messages={issues.get(b.id) ?? []}
          newId={newId}
          onChange={replace}
          quick={quickIds.includes(b.id)}
          onQuick={(on) => onQuickChange(b.id, on)}
          dragging={dragId === b.id}
          cardRef={(el) => {
            if (el) refs.current.set(b.id, el);
            else refs.current.delete(b.id);
          }}
          onRemove={() => onChange(removeBlock(blocks, b.id))}
          grip={{
            onPointerDown: (e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragId(b.id);
            },
            onPointerMove: onDrag,
            onPointerUp: () => setDragId(null),
            onPointerCancel: () => setDragId(null),
            onKeyDown: (e) => onKey(e, b.id),
          }}
        />
      ))}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.addBlock}>
        {PALETTE.map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...blocks, newBlock(type, { newId }, blocks.at(-1)?.order ?? null)])}
          >
            <Plus aria-hidden />
            {t.types[type]}
          </Button>
        ))}
      </div>
    </section>
  );
}

interface GripHandlers {
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}

function BlockCard({
  def, index, messages, newId, onChange, quick, onQuick, dragging, cardRef, onRemove, grip,
}: {
  def: BlockDef;
  index: number;
  messages: string[];
  newId: () => string;
  onChange: (def: BlockDef) => void;
  quick: boolean;
  onQuick: (on: boolean) => void;
  dragging: boolean;
  cardRef: (el: HTMLElement | null) => void;
  onRemove: () => void;
  grip: GripHandlers;
}) {
  const id = (k: string) => `block-${def.id}-${k}`;
  const invalid = messages.length > 0;
  return (
    <Card ref={cardRef} className={cn('gap-3 p-4', dragging && 'bg-accent')} role="region" aria-label={t.blockTitle(index, t.types[def.type])} data-testid="block-editor-card" data-block-type={def.type}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="cursor-grab touch-none"
          aria-label={t.moveBlock(def.label || String(index))}
          aria-description={t.moveHint}
          {...grip}
        >
          <GripVertical aria-hidden />
        </Button>
        <p className="flex-1 text-xs font-medium text-muted-foreground">{t.types[def.type]}</p>
        <Button type="button" variant="ghost" size="icon" aria-label={t.removeBlock(def.label || String(index))} onClick={onRemove}>
          <Trash2 aria-hidden />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('label')}>{t.blockLabel}</Label>
        <Input
          id={id('label')}
          value={def.label}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange({ ...def, label: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('description')}>{t.blockDescription}</Label>
        <Input
          id={id('description')}
          value={def.description ?? ''}
          onChange={(e) => {
            const { description: _drop, ...rest } = def;
            void _drop;
            onChange((e.target.value === '' ? rest : { ...rest, description: e.target.value }) as BlockDef);
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id={id('hideLabel')} checked={def.hideLabel === true} onChange={(e) => onChange(setHideLabel([def], e.target.checked)[0]!)} />
        <Label htmlFor={id('hideLabel')} className="font-normal">
          {t.hideLabel}
        </Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id={id('quick')} checked={quick} onChange={(e) => onQuick(e.target.checked)} />
        <Label htmlFor={id('quick')} className="font-normal">
          {t.quick}
        </Label>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox id={id('required')} checked={def.required} onChange={(e) => onChange({ ...def, required: e.target.checked })} />
        <Label htmlFor={id('required')} className="font-normal">
          {t.required}
        </Label>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id('role')}>{t.role}</Label>
        <Select
          id={id('role')}
          value={def.role ?? ''}
          onChange={(e) => {
            const { role: _drop, ...rest } = def;
            void _drop;
            onChange((e.target.value === '' ? rest : { ...rest, role: e.target.value as Role }) as BlockDef);
          }}
        >
          <option value="">{t.noRole}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.roles[r]}
            </option>
          ))}
        </Select>
      </div>
      <BlockConfigFields def={def} newId={newId} onChange={onChange} />
      {messages.map((m) => (
        <p key={m} role="alert" className="text-sm text-destructive">
          {m}
        </p>
      ))}
    </Card>
  );
}
