// Eingabe je Blocktyp (Spec 05 „Blocktypen"). Werte in den Formen aus @stb/core; leere Werte bleiben `undefined`/leer.
// Body-Map wird als eigener Schritt aus v2 portiert (BLK-03); bis dahin bleibt ihr Wert unverändert (Bild vorausgewählt).
import type { BlockDef, CheckboxValue, DateValue, TextareaValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { de } from '@/i18n/de';

export interface BlockFieldProps {
  def: BlockDef;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
}

export function BlockField({ def, value, onChange, invalid }: BlockFieldProps) {
  const id = `block-${def.id}`;
  const errorId = `${id}-error`;
  const aria = { 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? errorId : undefined };
  return (
    <section className="flex flex-col gap-2" data-testid="block-field" data-block-type={def.type}>
      <Label htmlFor={id}>
        {def.label}
        {def.required ? <span aria-label={de.entry.required}>{' *'}</span> : null}
      </Label>
      {def.description ? <p className="text-xs text-muted-foreground">{def.description}</p> : null}
      <FieldInput id={id} def={def} value={value} onChange={onChange} aria={aria} />
      {invalid ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {de.entry.requiredMissing}
        </p>
      ) : null}
    </section>
  );
}

type Aria = { 'aria-invalid'?: true; 'aria-describedby'?: string };

function FieldInput({ id, def, value, onChange, aria }: { id: string; def: BlockDef; value: unknown; onChange: (v: unknown) => void; aria: Aria }) {
  switch (def.type) {
    case 'slider': {
      const v = typeof value === 'number' ? value : undefined;
      const { min, max, step, unit, minLabel, maxLabel } = def.config;
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Slider id={id} min={min} max={max} step={step} value={v ?? min} onChange={(e) => onChange(Number(e.target.value))} {...aria} />
            <output htmlFor={id} className="w-14 text-right text-lg font-semibold tabular-nums">
              {v === undefined ? de.entry.noValue : unit ? `${v} ${unit}` : v}
            </output>
          </div>
          {minLabel || maxLabel ? (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{minLabel}</span>
              <span>{maxLabel}</span>
            </div>
          ) : null}
        </div>
      );
    }
    case 'checkbox': {
      const v = (value as CheckboxValue | undefined) ?? { checked: false };
      return (
        <div className="flex flex-col gap-2">
          <div className="flex min-h-11 items-center gap-3">
            <Checkbox id={id} checked={v.checked} onChange={(e) => onChange({ ...v, checked: e.target.checked })} {...aria} />
            <Label htmlFor={id} className="font-normal">
              {de.entry.checkboxYes}
            </Label>
          </div>
          {def.config.withNote ? (
            <Input aria-label={de.entry.note} value={v.note ?? ''} onChange={(e) => onChange({ ...v, note: e.target.value || undefined })} />
          ) : null}
        </div>
      );
    }
    case 'multiselect': {
      const v = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (optId: string) =>
        onChange(v.includes(optId) ? v.filter((x) => x !== optId) : def.config.multiple ? [...v, optId] : [optId]);
      return (
        <div id={id} role="group" className="flex flex-wrap gap-2" {...aria}>
          {def.config.options.map((o) => (
            <Button key={o.id} type="button" size="sm" variant={v.includes(o.id) ? 'default' : 'outline'} aria-pressed={v.includes(o.id)} onClick={() => toggle(o.id)}>
              {o.label}
            </Button>
          ))}
        </div>
      );
    }
    case 'text':
      return (
        <Input
          id={id}
          value={typeof value === 'string' ? value : ''}
          maxLength={def.config.maxLength}
          placeholder={def.config.placeholder}
          onChange={(e) => onChange(e.target.value)}
          {...aria}
        />
      );
    case 'textarea': {
      // Ereignisse und Anhänge folgen mit dem Port der v2-Komponente; vorhandene bleiben erhalten.
      const v = (value as TextareaValue | undefined) ?? {};
      return <Textarea id={id} value={v.text ?? ''} onChange={(e) => onChange({ ...v, text: e.target.value || undefined })} {...aria} />;
    }
    case 'date':
      return <DateInput id={id} mode={def.config.mode} value={value as DateValue | undefined} onChange={onChange} aria={aria} />;
    case 'bodymap':
      return (
        <p id={id} className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {de.entry.bodymapPending}
        </p>
      );
  }
}

function DateInput({ id, mode, value, onChange, aria }: { id: string; mode: 'date' | 'datetime' | 'duration' | 'range'; value: DateValue | undefined; onChange: (v: unknown) => void; aria: Aria }) {
  if (mode === 'duration') {
    const minutes = value && 'minutes' in value ? value.minutes : '';
    return (
      <Input id={id} type="number" min={0} inputMode="numeric" value={minutes} aria-label={de.entry.durationMinutes}
        onChange={(e) => onChange(e.target.value === '' ? undefined : { minutes: Number(e.target.value) })} {...aria} />
    );
  }
  if (mode === 'range') {
    const r = value && 'start' in value ? value : undefined;
    const set = (k: 'start' | 'end', s: string) => {
      const next = { start: r?.start ?? '', end: r?.end ?? '', [k]: s ? new Date(s).toISOString() : '' };
      onChange(next.start && next.end ? next : undefined);
    };
    return (
      <div className="grid grid-cols-2 gap-2">
        <Input id={id} type="datetime-local" aria-label={de.entry.periodStart} onChange={(e) => set('start', e.target.value)} {...aria} />
        <Input type="datetime-local" aria-label={de.entry.periodEnd} onChange={(e) => set('end', e.target.value)} />
      </div>
    );
  }
  const at = value && 'at' in value ? (value.at ?? '') : '';
  return mode === 'date' ? (
    <Input id={id} type="date" value={at} onChange={(e) => onChange({ at: e.target.value || undefined })} {...aria} />
  ) : (
    <Input id={id} type="datetime-local" onChange={(e) => onChange({ at: e.target.value ? new Date(e.target.value).toISOString() : undefined })} {...aria} />
  );
}
