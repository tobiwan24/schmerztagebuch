// Typabhängige Konfiguration eines Blocks im Vorlagen-Editor (Spec 05 Blocktypen-Tabelle, A-037).
import { useState } from 'react';
import type { BlockDef } from '@stb/core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { de } from '@/i18n/de';
import { OptionsEditor } from './OptionsEditor';

const t = de.templates.editor;

/** Leere Eingabe entfernt das optionale Feld (kein `undefined` im Datensatz). */
function setOptional<T extends object>(obj: T, key: string, value: string | number | undefined): T {
  const { [key]: _drop, ...rest } = obj as Record<string, unknown>;
  void _drop;
  return (value === undefined || value === '' ? rest : { ...rest, [key]: value }) as T;
}

/** Zahlenfeld mit eigenem Textzustand: Zwischenstände wie „-“ oder „1,“ bleiben beim Tippen erhalten. */
function NumberField({
  id, label, value, optional = false, onChange,
}: { id: string; label: string; value: number | undefined; optional?: boolean; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = Number(raw.replace(',', '.'));
          if (raw.trim() === '') return optional ? onChange(undefined) : undefined;
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </div>
  );
}

function TextField({ id, label, value, onChange }: { id: string; label: string; value: string | undefined; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function CheckField({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

export function BlockConfigFields({ def, newId, onChange }: { def: BlockDef; newId: () => string; onChange: (def: BlockDef) => void }) {
  const id = (k: string) => `block-${def.id}-${k}`;
  switch (def.type) {
    case 'slider': {
      const c = def.config;
      const set = (patch: Partial<typeof c>) => onChange({ ...def, config: { ...c, ...patch } });
      return (
        <>
          <div className="grid grid-cols-3 gap-3">
            <NumberField id={id('min')} label={t.slider.min} value={c.min} onChange={(v) => v !== undefined && set({ min: v })} />
            <NumberField id={id('max')} label={t.slider.max} value={c.max} onChange={(v) => v !== undefined && set({ max: v })} />
            <NumberField id={id('step')} label={t.slider.step} value={c.step} onChange={(v) => v !== undefined && set({ step: v })} />
          </div>
          <TextField id={id('unit')} label={t.slider.unit} value={c.unit} onChange={(v) => onChange({ ...def, config: setOptional(c, 'unit', v) })} />
          <TextField id={id('minLabel')} label={t.slider.minLabel} value={c.minLabel} onChange={(v) => onChange({ ...def, config: setOptional(c, 'minLabel', v) })} />
          <TextField id={id('maxLabel')} label={t.slider.maxLabel} value={c.maxLabel} onChange={(v) => onChange({ ...def, config: setOptional(c, 'maxLabel', v) })} />
          <TextField id={id('infoText')} label={t.slider.infoText} value={c.infoText} onChange={(v) => onChange({ ...def, config: setOptional(c, 'infoText', v) })} />
        </>
      );
    }
    case 'checkbox':
      return <CheckField id={id('withNote')} label={t.checkboxNote} checked={def.config.withNote} onChange={(withNote) => onChange({ ...def, config: { withNote } })} />;
    case 'text': {
      const c = def.config;
      return (
        <>
          <NumberField
            id={id('maxLength')}
            label={t.text.maxLength}
            value={c.maxLength}
            optional
            onChange={(v) => onChange({ ...def, config: setOptional(c, 'maxLength', v !== undefined && Number.isInteger(v) && v > 0 ? v : undefined) })}
          />
          <TextField id={id('placeholder')} label={t.text.placeholder} value={c.placeholder} onChange={(v) => onChange({ ...def, config: setOptional(c, 'placeholder', v) })} />
        </>
      );
    }
    case 'textarea': {
      const c = def.config;
      return (
        <>
          <CheckField id={id('events')} label={t.textarea.events} checked={c.allowEvents} onChange={(allowEvents) => onChange({ ...def, config: { ...c, allowEvents } })} />
          <CheckField id={id('attachments')} label={t.textarea.attachments} checked={c.allowAttachments} onChange={(allowAttachments) => onChange({ ...def, config: { ...c, allowAttachments } })} />
        </>
      );
    }
    case 'date':
      return (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id('mode')}>{t.date.mode}</Label>
          <Select id={id('mode')} value={def.config.mode} onChange={(e) => onChange({ ...def, config: { mode: e.target.value as typeof def.config.mode } })}>
            {(Object.keys(t.date.modes) as (keyof typeof t.date.modes)[]).map((m) => (
              <option key={m} value={m}>
                {t.date.modes[m]}
              </option>
            ))}
          </Select>
        </div>
      );
    case 'multiselect':
      return (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id('multiple')}>{t.multiselect.mode}</Label>
            <Select
              id={id('multiple')}
              value={def.config.multiple ? 'multiple' : 'single'}
              onChange={(e) => onChange({ ...def, config: { ...def.config, multiple: e.target.value === 'multiple' } })}
            >
              <option value="single">{t.multiselect.single}</option>
              <option value="multiple">{t.multiselect.multiple}</option>
            </Select>
          </div>
          <OptionsEditor blockId={def.id} options={def.config.options} newId={newId} onChange={(options) => onChange({ ...def, config: { ...def.config, options } })} />
        </>
      );
    case 'bodymap':
      return (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id('preset')}>{t.bodymap.preset}</Label>
          <Select id={id('preset')} value={def.config.defaultPresetId} onChange={(e) => onChange({ ...def, config: { ...def.config, defaultPresetId: e.target.value } })}>
            {(Object.keys(de.bodymap.presets) as (keyof typeof de.bodymap.presets)[]).map((p) => (
              <option key={p} value={p}>
                {de.bodymap.presets[p]}
              </option>
            ))}
          </Select>
        </div>
      );
  }
}
