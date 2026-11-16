// Eingabe je Blocktyp (Spec 05 „Blocktypen"). Werte in den Formen aus @stb/core; leere Werte bleiben `undefined`/leer.
import { useState } from 'react';
import { Check, Info } from 'lucide-react';
import type { BlockDef, BodymapValue, CheckboxValue, DateValue, MedicationValue, TextareaValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { BodyMapField } from './BodyMapField';
import { MedicationField } from './MedicationField';
import { TextareaField, type AttachmentApi } from './TextareaField';
import { optionTone } from '@/lib/option-colors';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';

export interface BlockFieldProps {
  def: BlockDef;
  value: unknown;
  onChange: (value: unknown) => void;
  invalid: boolean;
  /** Tagebuch (eigene Body-Map-Bilder). */
  diaryId?: string;
  /** Body-Map: „Als Standard für dieses Feld". */
  onSetDefault?: (blockId: string, presetId: string) => Promise<void>;
  /** Textarea: Anhänge des Formulars (BLK-30/31) und ID-Quelle für Ereignisse. */
  attachments?: AttachmentApi;
  newId?: () => string;
  /** ID-Quelle für Medikamenten-Positionen (auch im Schnelleintrag, wo `newId` fehlt). */
  itemId?: () => string;
}

export function BlockField({ def, value, onChange, invalid, diaryId, onSetDefault, attachments, newId, itemId }: BlockFieldProps) {
  const id = `block-${def.id}`;
  const errorId = `${id}-error`;
  const aria = { 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? errorId : undefined };
  return (
    <section className="flex flex-col gap-2" data-testid="block-field" data-block-type={def.type}>
      {/* `hideLabel`: kein sichtbares Label, der zugängliche Name bleibt (BLK-41). */}
      <Label htmlFor={id} className={def.hideLabel ? 'sr-only' : undefined}>
        {def.label}
        {def.required ? <span aria-label={de.entry.required}>{' *'}</span> : null}
      </Label>
      {def.description ? <p className="text-xs text-muted-foreground">{def.description}</p> : null}
      <FieldInput id={id} def={def} value={value} onChange={onChange} aria={aria} diaryId={diaryId} onSetDefault={onSetDefault ? (pid) => onSetDefault(def.id, pid) : undefined} attachments={attachments} newId={newId} itemId={itemId ?? newId} />
      {invalid ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {de.entry.requiredMissing}
        </p>
      ) : null}
    </section>
  );
}

/** Aufklappbarer Info-Hinweis am Slider (BLK-41). */
function InfoHint({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="ghost" size="sm" className="self-start" aria-expanded={open} aria-controls={`${id}-info`} onClick={() => setOpen(!open)}>
        <Info aria-hidden />
        {open ? de.entry.infoHide : de.entry.infoShow}
      </Button>
      {open ? (
        <p id={`${id}-info`} role="note" className="rounded-md bg-muted px-3 py-2 text-sm">
          {text}
        </p>
      ) : null}
    </div>
  );
}

type Aria = { 'aria-invalid'?: true; 'aria-describedby'?: string };

function FieldInput({
  id, def, value, onChange, aria, diaryId, onSetDefault, attachments, newId, itemId,
}: { id: string; def: BlockDef; value: unknown; onChange: (v: unknown) => void; aria: Aria; diaryId?: string; onSetDefault?: (presetId: string) => Promise<void>; attachments?: AttachmentApi; newId?: () => string; itemId?: () => string }) {
  switch (def.type) {
    case 'slider': {
      const v = typeof value === 'number' ? value : undefined;
      const { min, max, step, unit, minLabel, maxLabel, infoText } = def.config;
      return (
        <div className="flex flex-col gap-1">
          {infoText ? <InfoHint id={id} text={infoText} /> : null}
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
          {def.config.options.map((o) => {
            const on = v.includes(o.id);
            const tone = optionTone(o.color);
            return (
              <Button
                key={o.id} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={() => toggle(o.id)}
                className={cn(tone && (on ? tone.selected : tone.idle), on && 'font-semibold')}
              >
                {on ? <Check aria-hidden /> : null}
                {o.label}
              </Button>
            );
          })}
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
    case 'textarea':
      return (
        <TextareaField
          id={id} value={value as TextareaValue | undefined} onChange={onChange} aria={aria} attachments={attachments} newId={newId}
          // Ereignisse brauchen eine ID-Quelle (UUID v7); ohne sie (Schnelleintrag) nur Text.
          config={newId ? def.config : { ...def.config, allowEvents: false }}
        />
      );
    case 'date':
      return <DateInput id={id} mode={def.config.mode} value={value as DateValue | undefined} onChange={onChange} aria={aria} />;
    case 'medication':
      return <MedicationField id={id} config={def.config} value={value as MedicationValue | undefined} onChange={onChange} newId={itemId} />;
    case 'bodymap':
      return (
        <BodyMapField
          id={id} value={value as BodymapValue | undefined} defaultPresetId={def.config.defaultPresetId} onChange={onChange}
          diaryId={diaryId} onSetDefault={onSetDefault}
        />
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
