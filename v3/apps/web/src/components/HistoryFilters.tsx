// Verlauf: Suche, Filter-Chips und gespeicherte Filter (Spec 06/10, Wireframe verlauf.html). Baut eine `FilterSpec`;
// die Treffer liefert der Analyse-Worker. Gespeicherte Filter sind synchronisierte `savedFilter`-Records (ANA-11).
import { useEffect, useRef, useState } from 'react';
import { Star, X } from 'lucide-react';
import type { FilterSpec, SavedFilter } from '@stb/analysis';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export type RangePreset = 'all' | '7d' | '30d' | '90d';
export interface FilterState {
  text: string;
  range: RangePreset;
  outcome: boolean;
  meds: boolean;
  events: boolean;
}
export const EMPTY_FILTER: FilterState = { text: '', range: 'all', outcome: false, meds: false, events: false };
export const OUTCOME_THRESHOLD = 6;

export const isActive = (s: FilterState) => s.text.trim() !== '' || s.range !== 'all' || s.outcome || s.meds || s.events;

/** UI-Zustand → FilterSpec. `medOptionIds`: alle Optionen der Blöcke mit Rolle `medication`. */
export function toSpec(s: FilterState, diaryIds: string[], medOptionIds: string[]): FilterSpec {
  const conditions: NonNullable<FilterSpec['conditions']> = [];
  if (s.outcome) conditions.push({ kind: 'number', role: 'outcome', op: '>=', value: OUTCOME_THRESHOLD });
  if (s.meds && medOptionIds.length) conditions.push({ kind: 'option', role: 'medication', optionIds: medOptionIds, mode: 'any' });
  if (s.events) conditions.push({ kind: 'event' });
  return {
    diaryIds, range: { preset: s.range },
    ...(s.text.trim() ? { text: s.text.trim() } : {}),
    ...(conditions.length ? { conditions } : {}),
  };
}

/** FilterSpec (aus gespeichertem Filter) → UI-Zustand; unbekannte Bestandteile bleiben unberücksichtigt. */
export function fromSpec(spec: FilterSpec): FilterState {
  const c = spec.conditions ?? [];
  const range = 'preset' in spec.range && ['all', '7d', '30d', '90d'].includes(spec.range.preset) ? (spec.range.preset as RangePreset) : 'all';
  return {
    text: spec.text ?? '',
    range,
    outcome: c.some((x) => x.kind === 'number' && 'role' in x && x.role === 'outcome'),
    meds: c.some((x) => x.kind === 'option' && 'role' in x && x.role === 'medication'),
    events: c.some((x) => x.kind === 'event'),
  };
}

const RANGES: RangePreset[] = ['all', '7d', '30d', '90d'];

export function HistoryFilters({ state, onChange, diaryIds, medOptionIds }: { state: FilterState; onChange: (s: FilterState) => void; diaryIds: string[]; medOptionIds: string[] }) {
  const data = useData();
  const ownerDiary = diaryIds[0];
  const saved = useQuery(async () => (ownerDiary ? data.diary.listSavedFilters(ownerDiary) : []), [data.diary, ownerDiary]);
  const [text, setText] = useState(state.text);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  // Suche entprellt übernehmen
  useEffect(() => {
    const t = setTimeout(() => {
      if (text === state.text) return;
      external.current = text;
      onChange({ ...state, text });
    }, 200);
    return () => clearTimeout(t);
  }, [text, state, onChange]);
  // Nur Änderungen von außen (gespeicherter Filter, Zurücksetzen) ins Feld übernehmen — nie die laufende Eingabe überschreiben.
  const external = useRef(state.text);
  useEffect(() => {
    if (state.text !== external.current) {
      external.current = state.text;
      setText(state.text);
    }
  }, [state.text]);

  const toggle = (k: 'outcome' | 'meds' | 'events') => onChange({ ...state, [k]: !state[k] });

  async function save() {
    if (!ownerDiary || !name.trim()) return;
    const s = await data.stamper.stamp();
    const f: SavedFilter = { id: data.newId(), diaryId: ownerDiary, name: name.trim(), filter: toSpec(state, diaryIds, medOptionIds), hlc: s.hlc, updatedAt: s.at };
    await data.diary.saveSavedFilter(f);
    setSaving(false);
    setName('');
    saved.retry();
  }
  async function remove(f: SavedFilter) {
    const s = await data.stamper.stamp();
    await data.diary.deleteSavedFilter(f.id, { hlc: s.hlc, updatedAt: s.at });
    saved.retry();
  }

  return (
    <section className="flex flex-col gap-3" aria-label={de.history.filters}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="history-search" className="sr-only">
          {de.history.search}
        </Label>
        <Input id="history-search" type="search" placeholder={de.history.searchPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <ToggleGroup aria-label={de.history.range}>
        {RANGES.map((r) => (
          <ToggleGroupItem key={r} pressed={state.range === r} onClick={() => onChange({ ...state, range: r })}>
            {de.history.ranges[r]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={state.outcome ? 'default' : 'outline'} aria-pressed={state.outcome} onClick={() => toggle('outcome')}>
          {de.history.chipOutcome(OUTCOME_THRESHOLD)}
        </Button>
        {medOptionIds.length ? (
          <Button size="sm" variant={state.meds ? 'default' : 'outline'} aria-pressed={state.meds} onClick={() => toggle('meds')}>
            {de.history.chipMeds}
          </Button>
        ) : null}
        <Button size="sm" variant={state.events ? 'default' : 'outline'} aria-pressed={state.events} onClick={() => toggle('events')}>
          {de.history.chipEvents}
        </Button>
        {isActive(state) ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTER)}>
              <X aria-hidden />
              {de.history.reset}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
              <Star aria-hidden />
              {de.history.saveFilter}
            </Button>
          </>
        ) : null}
      </div>
      {saved.status === 'ok' && saved.data.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" data-testid="saved-filters">
          <span className="text-xs text-muted-foreground">{de.history.saved}</span>
          {saved.data.map((f) => (
            <span key={f.id} className="inline-flex items-center">
              <Button size="sm" variant="secondary" onClick={() => onChange(fromSpec(f.filter))}>
                <Star aria-hidden />
                {f.name}
              </Button>
              <Button size="icon" variant="ghost" aria-label={de.history.deleteSaved(f.name)} onClick={() => void remove(f)}>
                <X aria-hidden />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      <Dialog open={saving} onClose={() => setSaving(false)} aria-labelledby="save-filter-title">
        <DialogTitle id="save-filter-title">{de.history.saveFilter}</DialogTitle>
        <div className="mt-4 flex flex-col gap-2">
          <Label htmlFor="filter-name">{de.history.filterName}</Label>
          <Input id="filter-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setSaving(false)}>
            {de.lock.cancel}
          </Button>
          <Button disabled={!name.trim()} onClick={() => void save()}>
            {de.entry.save}
          </Button>
        </DialogFooter>
      </Dialog>
    </section>
  );
}
