// Verlauf: Suche, Filter-Chips und gespeicherte Filter (Spec 06/10, Wireframe verlauf.html). Baut eine `FilterSpec`;
// die Treffer liefert der Analyse-Worker. Gespeicherte Filter sind synchronisierte `savedFilter`-Records (ANA-11).
import { cn } from '@/lib/utils';
import { TOUR_RING } from '@/tour/anchor';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, Download, Filter, Star, X } from 'lucide-react';
import { Link } from 'react-router';
import { SORT_ORDERS, type FilterSpec, type SavedFilter, type SortOrder } from '@stb/analysis';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useData } from '@/data/DataContext';
import { useAuthorName } from '@/data/useSharing';
import { useQuery } from '@/data/useQuery';
import { de } from '@/i18n/de';

export type RangePreset = 'all' | '7d' | '30d' | '90d';
export type ContentKind = 'doctor' | 'bodymap' | 'image' | 'pdf';
export const CONTENT_KINDS: ContentKind[] = ['doctor', 'bodymap', 'image', 'pdf'];
export interface FilterState {
  text: string;
  range: RangePreset;
  /** Freier Zeitraum (`YYYY-MM-DD`, leer = offen); hat Vorrang vor `range`. */
  from: string;
  to: string;
  /** Vorlagen-IDs; leer = alle. */
  templateIds: string[];
  outcome: boolean;
  meds: boolean;
  events: boolean;
  /** Inhalt (UND): Arztbesuch, Body-Map, Foto, PDF. */
  content: ContentKind[];
  /** Nur Einträge dieses Autors (Benutzer-ID, SHR-15); leer = alle. */
  authorId: string;
}
export const EMPTY_FILTER: FilterState = { text: '', range: 'all', from: '', to: '', templateIds: [], outcome: false, meds: false, events: false, content: [], authorId: '' };
export const OUTCOME_THRESHOLD = 6;
const OPEN_FROM = '1970-01-01';
const OPEN_TO = '9999-12-31';

export const isActive = (s: FilterState) =>
  s.text.trim() !== '' || s.range !== 'all' || s.from !== '' || s.to !== '' || s.templateIds.length > 0 || s.outcome || s.meds || s.events || s.content.length > 0 || s.authorId !== '';

/** Anzahl aktiver Filter für das Zähler-Badge (RDM-028 P4): je Vorlage 1, Zeitraum 1, je Inhalt/Kennzeichen 1, Autor 1; die offen sichtbare Suche zählt nicht, `meds` nur mit angezeigtem Medikament-Chip (`medsAvailable`). */
export const activeFilterCount = (s: FilterState, medsAvailable = true) =>
  s.templateIds.length + (s.range !== 'all' || s.from !== '' || s.to !== '' ? 1 : 0) + s.content.length + [s.outcome, s.meds && medsAvailable, s.events].filter(Boolean).length + (s.authorId !== '' ? 1 : 0);

type Cond = NonNullable<FilterSpec['conditions']>[number];
const CONTENT_CONDITIONS: Record<ContentKind, Cond> = {
  doctor: { kind: 'event', category: 'doctor' },
  bodymap: { kind: 'bodymap' },
  image: { kind: 'attachment', attachmentKind: 'image' },
  pdf: { kind: 'attachment', attachmentKind: 'pdf' },
};

/** UI-Zustand → FilterSpec. `medOptionIds`: alle Optionen der Blöcke mit Rolle `medication`. */
export function toSpec(s: FilterState, diaryIds: string[], medOptionIds: string[]): FilterSpec {
  const conditions: NonNullable<FilterSpec['conditions']> = [];
  if (s.outcome) conditions.push({ kind: 'number', role: 'outcome', op: '>=', value: OUTCOME_THRESHOLD });
  if (s.meds && medOptionIds.length) conditions.push({ kind: 'option', role: 'medication', optionIds: medOptionIds, mode: 'any' });
  if (s.events) conditions.push({ kind: 'event' });
  for (const k of CONTENT_KINDS) if (s.content.includes(k)) conditions.push(CONTENT_CONDITIONS[k]);
  if (s.authorId) conditions.push({ kind: 'meta', field: 'author', value: s.authorId });
  const free = s.from !== '' || s.to !== '';
  const from = s.from || OPEN_FROM;
  const to = s.to || OPEN_TO;
  return {
    diaryIds,
    range: free ? (from <= to ? { from, to } : { from: to, to: from }) : { preset: s.range },
    ...(s.templateIds.length ? { templateIds: s.templateIds } : {}),
    ...(s.text.trim() ? { text: s.text.trim() } : {}),
    ...(conditions.length ? { conditions } : {}),
  };
}

/** FilterSpec (aus gespeichertem Filter) → UI-Zustand; unbekannte Bestandteile bleiben unberücksichtigt. */
export function fromSpec(spec: FilterSpec): FilterState {
  const c = spec.conditions ?? [];
  const free = 'from' in spec.range ? spec.range : null;
  const range = 'preset' in spec.range && ['all', '7d', '30d', '90d'].includes(spec.range.preset) ? (spec.range.preset as RangePreset) : 'all';
  return {
    text: spec.text ?? '',
    range,
    from: free && free.from !== OPEN_FROM ? free.from : '',
    to: free && free.to !== OPEN_TO ? free.to : '',
    templateIds: spec.templateIds ?? [],
    outcome: c.some((x) => x.kind === 'number' && 'role' in x && x.role === 'outcome'),
    meds: c.some((x) => x.kind === 'option' && 'role' in x && x.role === 'medication'),
    events: c.some((x) => x.kind === 'event' && !x.category),
    content: CONTENT_KINDS.filter((k) => c.some((x) => JSON.stringify(x) === JSON.stringify(CONTENT_CONDITIONS[k]))),
    authorId: c.flatMap((x) => (x.kind === 'meta' && x.field === 'author' ? [x.value] : []))[0] ?? '',
  };
}

const RANGES: RangePreset[] = ['all', '7d', '30d', '90d'];

export function HistoryFilters({ state, onChange, diaryIds, medOptionIds, templates, sort, onSortChange }: { state: FilterState; onChange: (s: FilterState) => void; diaryIds: string[]; medOptionIds: string[]; templates: { id: string; name: string }[]; sort: SortOrder; onSortChange: (s: SortOrder) => void }) {
  const data = useData();
  const ownerDiary = diaryIds[0];
  const saved = useQuery(async () => (ownerDiary ? data.diary.listSavedFilters(ownerDiary) : []), [data.diary, ownerDiary]);
  const [text, setText] = useState(state.text);
  const freeRange = state.from !== '' || state.to !== '';
  const authorName = useAuthorName(ownerDiary, state.authorId || undefined);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  // Nur ein Panel gleichzeitig; mit vorgewähltem Autor (SHR-15) startet das Filter-Panel offen, damit der Autor-Chip sichtbar ist.
  const [panel, setPanel] = useState<'filter' | 'sort' | null>(state.authorId ? 'filter' : null);
  const count = activeFilterCount(state, medOptionIds.length > 0);
  const filterBtn = useRef<HTMLButtonElement>(null);
  const sortBtn = useRef<HTMLButtonElement>(null);
  // Escape schließt das offene Panel und gibt den Fokus an den Auslöser zurück.
  useEffect(() => {
    if (!panel || saving) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      (panel === 'filter' ? filterBtn : sortBtn).current?.focus();
      setPanel(null);
    };
    // Am Dokument, weil WebKit Knöpfe beim Klick nicht fokussiert.
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel, saving]);
  const togglePanel = (p: 'filter' | 'sort') => setPanel(panel === p ? null : p);

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
    <section data-tour="history-filters" className={cn('flex flex-col gap-3', TOUR_RING)} aria-label={de.history.filters}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="history-search" className="sr-only">
          {de.history.search}
        </Label>
        <Input id="history-search" type="search" placeholder={de.history.searchPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={filterBtn} variant="outline" aria-expanded={panel === 'filter'} aria-controls="history-filter-panel" onClick={() => togglePanel('filter')}>
          <Filter aria-hidden />
          {de.history.filter}
          {count > 0 ? (
            <Badge data-testid="filter-count">
              {count}
              <span className="sr-only"> {de.history.activeFilters(count)}</span>
            </Badge>
          ) : null}
          <ChevronDown aria-hidden className={cn('transition-transform', panel === 'filter' && 'rotate-180')} />
        </Button>
        <Button ref={sortBtn} variant="outline" aria-expanded={panel === 'sort'} aria-controls="history-sort-panel" onClick={() => togglePanel('sort')}>
          <ArrowUpDown aria-hidden />
          {de.history.sortButton}
          <ChevronDown aria-hidden className={cn('transition-transform', panel === 'sort' && 'rotate-180')} />
        </Button>
        {/* Export mit den aktuell angewendeten Filtern (EXP-18, A-073): FilterSpec als Router-State an die Export-Seite. */}
        <Button asChild size="icon" variant="outline" className="ml-auto">
          <Link to="/more/export" state={{ filter: toSpec(state, diaryIds, medOptionIds) }} aria-label={de.history.export} title={de.history.export}>
            <Download aria-hidden />
          </Link>
        </Button>
      </div>
      <div id="history-filter-panel" role="region" aria-label={de.history.filter} hidden={panel !== 'filter'} className={cn('flex flex-col gap-3 rounded-lg border bg-card p-3', panel !== 'filter' && 'hidden')}>
        <ToggleGroup aria-label={de.history.range}>
          {RANGES.map((r) => (
            <ToggleGroupItem key={r} pressed={state.range === r && !freeRange} onClick={() => onChange({ ...state, range: r, from: '', to: '' })}>
              {de.history.ranges[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="history-from">{de.history.from}</Label>
            <Input id="history-from" type="date" value={state.from} max={state.to || undefined} onChange={(e) => onChange({ ...state, from: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="history-to">{de.history.to}</Label>
            <Input id="history-to" type="date" value={state.to} min={state.from || undefined} onChange={(e) => onChange({ ...state, to: e.target.value })} />
          </div>
        </div>
        {templates.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={de.history.templates}>
            <span className="text-xs text-muted-foreground">{de.history.templates}</span>
            {templates.map((t) => {
              const on = state.templateIds.includes(t.id);
              return (
                <Button key={t.id} size="sm" className="h-auto max-w-full whitespace-normal py-1 text-left" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={() => onChange({ ...state, templateIds: on ? state.templateIds.filter((x) => x !== t.id) : [...state.templateIds, t.id] })}>
                  {t.name}
                </Button>
              );
            })}
          </div>
        ) : null}
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
          {state.authorId ? (
            <Button size="sm" variant="default" aria-pressed onClick={() => onChange({ ...state, authorId: '' })}>
              {de.history.chipAuthor(authorName.status === 'ok' && authorName.data ? authorName.data : de.history.unknownAuthor)}
            </Button>
          ) : null}
          {CONTENT_KINDS.map((k) => (
            <Button key={k} size="sm" variant={state.content.includes(k) ? 'default' : 'outline'} aria-pressed={state.content.includes(k)} onClick={() => onChange({ ...state, content: state.content.includes(k) ? state.content.filter((x) => x !== k) : [...state.content, k] })}>
              {de.history.content[k]}
            </Button>
          ))}
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
                <Button size="sm" className="h-auto min-h-9 max-w-full whitespace-normal py-1 text-left" variant="secondary" onClick={() => onChange(fromSpec(f.filter))}>
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
      </div>
      <div id="history-sort-panel" role="region" aria-label={de.history.sortButton} hidden={panel !== 'sort'} className={cn('flex flex-col gap-1 rounded-lg border bg-card p-3', panel !== 'sort' && 'hidden')}>
        <Label htmlFor="history-sort">{de.history.sort}</Label>
        <Select id="history-sort" value={sort} onChange={(e) => onSortChange(e.target.value as SortOrder)}>
          {SORT_ORDERS.map((o) => (
            <option key={o} value={o}>
              {de.history.sorts[o]}
            </option>
          ))}
        </Select>
      </div>
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
