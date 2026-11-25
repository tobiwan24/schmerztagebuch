// Vorgaben des Medikamenten-Blocks im Vorlagen-Editor (BLK-49): Name, Dosis, Einheit, Farbe, Reihenfolge (Pfeiltasten).
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { OPTION_COLORS, type MedicationConfig } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { deTemplates } from '@/i18n/lazy/templates';
import { SWATCH } from './OptionsEditor';

const t = deTemplates.editor.medication;
type Preset = MedicationConfig['presets'][number];

/** Dosis mit eigenem Textzustand (Zwischenstände wie „1,“ bleiben erhalten); leer = keine Vorgabe. */
function DoseInput({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === '') return onChange(undefined);
        const n = Number(raw.replace(',', '.'));
        if (Number.isFinite(n) && n > 0) onChange(n);
      }}
    />
  );
}

export function MedicationPresetsEditor({
  blockId, config, newId, onChange,
}: { blockId: string; config: MedicationConfig; newId: () => string; onChange: (config: MedicationConfig) => void }) {
  const presets = config.presets;
  const setPresets = (next: Preset[]) => onChange({ ...config, presets: next });
  const patch = (id: string, p: Partial<Preset>) => setPresets(presets.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (i: number, to: number) => {
    if (to < 0 || to >= presets.length) return;
    const next = [...presets];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item!);
    setPresets(next);
  };
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={t.presets}>
      <p className="text-sm font-medium">{t.presets}</p>
      {presets.map((p, i) => {
        const n = i + 1;
        const nm = p.name || String(n);
        const units = config.units.includes(p.unit) ? config.units : [...config.units, p.unit];
        return (
          <div key={p.id} data-testid="preset-row" className="flex flex-col gap-2 rounded-md border p-2">
            <Input id={`block-${blockId}-preset-${p.id}`} aria-label={t.name(n)} value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <DoseInput
                label={t.dose(n)}
                value={p.dose}
                onChange={(dose) => {
                  const { dose: _drop, ...rest } = p;
                  void _drop;
                  setPresets(presets.map((x) => (x.id === p.id ? (dose === undefined ? rest : { ...rest, dose }) : x)));
                }}
              />
              <Select aria-label={t.unit(n)} value={p.unit} onChange={(e) => patch(p.id, { unit: e.target.value })}>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t.color(nm)}>
              {OPTION_COLORS.map((c) => (
                <Button
                  key={c} type="button" variant="ghost" size="icon" aria-label={deTemplates.editor.multiselect.colorNames[c]} aria-pressed={p.color === c}
                  onClick={() => patch(p.id, { color: c })}
                  className={cn('size-7 rounded-full border-2 border-transparent p-0', SWATCH[c], p.color === c && 'border-foreground')}
                />
              ))}
              <span className="flex-1" />
              <Button type="button" variant="ghost" size="icon" aria-label={t.moveUp(nm)} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t.moveDown(nm)} disabled={i === presets.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowDown aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t.remove(nm)} onClick={() => setPresets(presets.filter((x) => x.id !== p.id))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button" variant="outline" size="sm" className="self-start"
        onClick={() => setPresets([...presets, { id: newId(), name: t.defaultName(presets.length + 1), unit: config.units[0] ?? 'mg', color: OPTION_COLORS[presets.length % OPTION_COLORS.length]! }])}
      >
        <Plus aria-hidden />
        {t.add}
      </Button>
      <div className="flex items-center gap-3">
        <Checkbox id={`block-${blockId}-allowFree`} checked={config.allowFree} onChange={(e) => onChange({ ...config, allowFree: e.target.checked })} />
        <Label htmlFor={`block-${blockId}-allowFree`} className="font-normal">
          {t.allowFree}
        </Label>
      </div>
    </div>
  );
}
