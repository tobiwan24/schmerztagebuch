// Eingabe des Medikamenten-Blocks (BLK-49): Positionen aus den Vorgaben oder frei, je Dosis, Einheit, Uhrzeit, Wirkung.
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { MEDICATION_MAX_ITEMS, type MedicationConfig, type MedicationItem, type MedicationValue } from '@stb/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { optionTone } from '@/lib/option-colors';
import { cn } from '@/lib/utils';
import { de } from '@/i18n/de';

const t = de.medication;

const pad = (n: number) => String(n).padStart(2, '0');
/** Lokale Uhrzeit „HH:MM“ eines ISO-Werts. */
function timeOf(at: string | undefined): string {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** „HH:MM“ am Tag des bisherigen Werts (sonst heute) → ISO. */
function withTime(hhmm: string, base: string | undefined): string | undefined {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return undefined;
  const d = base ? new Date(base) : new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.toISOString();
}

function DoseField({ id, label, value, onChange }: { id: string; label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input
        id={id} inputMode="decimal" value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw.trim() === '') return onChange(undefined);
          const n = Number(raw.replace(',', '.'));
          if (Number.isFinite(n) && n > 0) onChange(n);
        }}
      />
    </div>
  );
}

export function MedicationField({
  id, config, value, onChange, newId,
}: { id: string; config: MedicationConfig; value: MedicationValue | undefined; onChange: (v: MedicationValue | undefined) => void; newId?: () => string }) {
  const items = value?.items ?? [];
  const full = items.length >= MEDICATION_MAX_ITEMS;
  const commit = (next: MedicationItem[]) => onChange(next.length === 0 ? undefined : { items: next });
  const patch = (itemId: string, p: Partial<MedicationItem>, drop: (keyof MedicationItem)[] = []) =>
    commit(items.map((i) => {
      if (i.id !== itemId) return i;
      const next = { ...i, ...p };
      for (const k of drop) delete next[k];
      return next;
    }));
  const add = (item: Omit<MedicationItem, 'id'>) => newId && commit([...items, { id: newId(), at: new Date().toISOString(), ...item }]);

  return (
    <div id={id} className="flex flex-col gap-3" data-testid="medication-field">
      {items.map((it, idx) => {
        const preset = config.presets.find((p) => p.id === it.presetId);
        const units = it.unit && !config.units.includes(it.unit) ? [...config.units, it.unit] : config.units;
        const fid = (k: string) => `${id}-${it.id}-${k}`;
        return (
          <div key={it.id} role="group" aria-label={t.itemTitle(idx + 1, it.name)} data-testid="medication-item" className="flex flex-col gap-2 rounded-md border p-3">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={fid('name')} className="text-xs">{t.name}</Label>
                <Input id={fid('name')} value={it.name} readOnly={preset !== undefined} onChange={(e) => patch(it.id, { name: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={t.remove(it.name || String(idx + 1))} onClick={() => commit(items.filter((x) => x.id !== it.id))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <DoseField id={fid('dose')} label={t.dose} value={it.dose} onChange={(dose) => (dose === undefined ? patch(it.id, {}, ['dose']) : patch(it.id, { dose }))} />
              <div className="flex flex-col gap-1">
                <Label htmlFor={fid('unit')} className="text-xs">{t.unit}</Label>
                <Select id={fid('unit')} value={it.unit ?? ''} onChange={(e) => (e.target.value === '' ? patch(it.id, {}, ['unit']) : patch(it.id, { unit: e.target.value }))}>
                  <option value="" />
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={fid('time')} className="text-xs">{t.time}</Label>
                <Input
                  id={fid('time')} type="time" value={timeOf(it.at)}
                  onChange={(e) => {
                    const at = withTime(e.target.value, it.at);
                    return at ? patch(it.id, { at }) : patch(it.id, {}, ['at']);
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={fid('effect')} className="text-xs">{t.effect}</Label>
                <Select
                  id={fid('effect')} value={it.effect === undefined ? '' : String(it.effect)}
                  onChange={(e) => (e.target.value === '' ? patch(it.id, {}, ['effect']) : patch(it.id, { effect: Number(e.target.value) }))}
                >
                  <option value="">{t.noEffect}</option>
                  {Array.from({ length: 11 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.add}>
        {config.presets.map((p) => {
          const tone = optionTone(p.color);
          return (
            <Button
              key={p.id} type="button" size="sm" variant="outline" disabled={full || !newId} className={cn(tone?.idle)}
              onClick={() => add({ presetId: p.id, name: p.name, ...(p.dose !== undefined ? { dose: p.dose } : {}), unit: p.unit })}
            >
              <Plus aria-hidden />
              {t.addPreset(p.name)}
            </Button>
          );
        })}
        {config.allowFree ? (
          <Button type="button" size="sm" variant="outline" disabled={full || !newId} onClick={() => add({ name: t.defaultName })}>
            <Plus aria-hidden />
            {t.addFree}
          </Button>
        ) : null}
      </div>
      {full ? <p className="text-xs text-muted-foreground">{t.max}</p> : null}
    </div>
  );
}
