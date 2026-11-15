// Transformation v2 → v3 (Spec 11, Schritt 4) als reine Funktion: gleiche Eingabe → gleiche Ausgabe, deterministische
// IDs aus den v2-IDs (Schritt 6, A-031). Nichts wird geschrieben; Schreiben und Prüfen übernimmt die Web-Schicht.
import { canonical } from '../canonical.js';
import { uuidV7FromSeed } from '../ids.js';
import { keyBetween } from '../fractional-index.js';
import { isMultiple } from '../blocks/common.js';
import { blockDefSchema, templateSchema, templateVersionSchema, entrySchemaFor, type BlockDef, type Entry, type Template, type TemplateVersion, type EntryPeriod, type Role } from '../templates.js';
import { bodymapImageSchema, BODYMAP_IMAGE_MAX_CHARS, type BodymapImage } from '../bodymap-image.js';
import { formatHlc } from '../hlc.js';
import { sha256, sha256Hex } from './sha256.js';
import { isIsoDate, isoInZone, wallTimeToMs } from './time.js';
import type { V2Block, V2DecodedEntry, V2Source, V2Template } from './v2-types.js';

/** Zeitanteil der UUID v7 für Struktur-IDs (Vorlagen, Blöcke, Optionen, Bilder) — v2 kennt kein `createdAt` dafür. */
export const MIGRATION_STRUCTURE_MS = Date.UTC(2025, 0, 1);
/** HLC-Knoten migrierter Einträge; HLC-Zeit = v2-`updatedAt` → spätere Änderungen in v3 gewinnen immer. */
export const MIGRATION_HLC_NODE = 'v2';
export const DEFAULT_BODYMAP_PRESET = 'default-koerper-vorderseite';
const NEW_OPTION_COLOR = '#6b7280';
const DEFAULT_OPTION_COLOR = '#007AFF';
const MAX_PATH = 1000;

export type ResolvedImage = { presetId: string } | { width: number; height: number };

export interface MigrationOptions {
  diaryId: string;
  authorId: string;
  /** Gerätezeitzone = Tagebuch-Zeitzone (Spec 11). */
  timezone: string;
  /** Order-Key, nach dem die migrierten Vorlagen einsortiert werden (letzte vorhandene Vorlage), sonst `null`. */
  afterOrder?: string | null;
  /**
   * Bild einer v2-Body-Map einordnen: Standardbild oder eigenes Bild (mit Maßen). `null` = nicht verwendbar.
   * Die Web-Schicht vergleicht dazu die Pixel mit den Standardbildern (v2 speicherte nur die Data-URL).
   */
  resolveImage(image: string, hint: { defaultPresetId?: string }): ResolvedImage | null;
}

export interface MigratedAttachment {
  id: string;
  diaryId: string;
  entryId: string;
  kind: 'image' | 'pdf';
  mime: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  dataUrl: string;
}

export interface MigrationReport {
  counts: {
    templates: number;
    templateVersions: number;
    entries: number;
    attachments: number;
    bodymapImages: number;
    skippedDeleted: number;
    undecryptable: number;
  };
  undecryptable: { v2Id: number; date: string; reason: string }[];
  unknownValues: { date: string; template: string; block: string; value: string }[];
  warnings: string[];
  /** `v2TemplateKey/v2BlockId/typ` → v3-Block-ID (Spec 11 „Mapping-Tabelle"). */
  blockMap: Record<string, string>;
}

export interface MigratedTemplate {
  template: Template;
  versions: TemplateVersion[];
}

export interface MigrationResult {
  templates: MigratedTemplate[];
  entries: Entry[];
  bodymapImages: BodymapImage[];
  attachments: MigratedAttachment[];
  report: MigrationReport;
}

// ---------------------------------------------------------------------------------------------------------------

const detId = (kind: string, key: string, ms: number) => uuidV7FromSeed(Math.max(0, Math.floor(ms)), sha256(`v2:${kind}:${key}`));
const templateKey = (t: { syncId?: string | undefined; id: number }) => t.syncId ?? `local-${t.id}`;
const entryKey = (e: V2DecodedEntry) => e.syncId ?? `local-${e.id}`;
const iso = (ms: number) => new Date(ms).toISOString();
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/** Primärer Datum-Block der Momentaufnahme (Pflichtblock); wird zu `occurredAt`/`period`, nicht zu einem Block. */
function primaryDateIndex(blocks: readonly V2Block[]): number {
  const fixed = blocks.findIndex((b) => b.type === 'date' && b.isDeletable === false);
  return fixed >= 0 ? fixed : blocks.findIndex((b) => b.type === 'date');
}

interface DateValue {
  mode: 'single' | 'range';
  startDate: string;
  endDate?: string;
  time?: string;
  startTime?: string;
  endTime?: string;
}

function parseDateValue(v: unknown): DateValue | undefined {
  const p = parseJson(v);
  if (isObj(p) && (p.mode === 'single' || p.mode === 'range') && isIsoDate(p.startDate)) return p as unknown as DateValue;
  if (typeof v === 'string' && isIsoDate(v)) return { mode: 'single', startDate: v }; // Legacy: nur Datum
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Blockdefinitionen

interface DefContext {
  tKey: string;
  blockMap: Record<string, string>;
  warnings: Set<string>;
  templateName: string;
  /** Modus je Nebendatum-Block (v2-Block-ID): `range`, sobald irgendein Eintrag einen Zeitraum hat. */
  dateModes: Map<string, 'datetime' | 'range'>;
}

type V3Type = BlockDef['type'];

function v3TypeOf(b: V2Block, dateMode?: 'datetime' | 'range'): { type: V3Type; dateMode?: 'datetime' | 'range' } | null {
  switch (b.type) {
    case 'text':
    case 'checkbox':
    case 'slider':
    case 'multiselect':
    case 'textarea':
    case 'bodymap':
      return { type: b.type };
    case 'image':
      return { type: 'textarea' };
    case 'date':
      return { type: 'date', dateMode: dateMode ?? 'datetime' };
    default:
      return null;
  }
}

function blockIdFor(ctx: DefContext, b: V2Block, type: V3Type): string {
  const key = `${ctx.tKey}/${b.id}/${type}`;
  const id = detId('block', key, MIGRATION_STRUCTURE_MS);
  ctx.blockMap[key] = id;
  return id;
}

export const optionIdFor = (blockId: string, label: string) => detId('option', `${blockId}/${label}`, MIGRATION_STRUCTURE_MS);

function sliderConfig(b: V2Block, ctx: DefContext): { min: number; max: number; step: number } {
  let min = typeof b.min === 'number' && Number.isFinite(b.min) ? b.min : 0;
  let max = typeof b.max === 'number' && Number.isFinite(b.max) ? b.max : 10;
  let step = typeof b.step === 'number' && b.step > 0 ? b.step : 1;
  if (max <= min) {
    ctx.warnings.add(`„${ctx.templateName}“ / „${b.label ?? ''}“: ungültige Skala ${min}–${max}, ersetzt durch 0–10`);
    [min, max] = [0, 10];
  }
  if (!isMultiple(max - min, step)) {
    step = (max - min) / Math.max(1, Math.round((max - min) / step));
    ctx.warnings.add(`„${ctx.templateName}“ / „${b.label ?? ''}“: Schrittweite angepasst auf ${step}`);
  }
  return { min, max, step };
}

/** v2 kennt keine Medikamenten-Rolle; Auswahl-/Checkbox-Felder mit eindeutigem Namen bekommen sie (Medikamententage, A-031). */
const MEDICATION_LABEL = /medikament|medizin|tablette|arznei|schmerzmittel|präparat|einnahme/i;

function roleOf(b: V2Block): Role | undefined {
  if ((b.type === 'multiselect' || b.type === 'checkbox') && MEDICATION_LABEL.test(b.label ?? '')) return 'medication';
  if (b.type !== 'slider' || !b.dashboard || b.dashboard.enabled === false) return undefined;
  return b.dashboard.type === 'pain' ? 'outcome' : b.dashboard.type === 'function' ? 'function' : undefined;
}

function optionsOf(b: V2Block): { text: string; color: string }[] {
  if (Array.isArray(b.multiSelectOptions) && b.multiSelectOptions.length) {
    return b.multiSelectOptions.filter((o) => typeof o?.text === 'string' && o.text.trim()).map((o) => ({ text: o.text.trim(), color: o.color || DEFAULT_OPTION_COLOR }));
  }
  return (b.options ?? []).filter((o) => typeof o === 'string' && o.trim()).map((o) => ({ text: o.trim(), color: DEFAULT_OPTION_COLOR }));
}

function defaultPresetOf(b: V2Block, ctx: DefContext): string {
  const id = b.bodyMapConfig?.defaultPresetId;
  if (id && id.startsWith('default-')) return id;
  if (id) ctx.warnings.add(`„${ctx.templateName}“ / „${b.label ?? ''}“: eigenes v2-Standardbild nicht übertragbar — Körper Vorderseite als Standard`);
  return DEFAULT_BODYMAP_PRESET;
}

function makeDef(b: V2Block, order: string, ctx: DefContext, dateMode?: 'datetime' | 'range'): BlockDef | null {
  const t = v3TypeOf(b, dateMode);
  if (!t) {
    ctx.warnings.add(`„${ctx.templateName}“: unbekannter Blocktyp „${b.type}“ übersprungen`);
    return null;
  }
  const base = { id: blockIdFor(ctx, b, t.type), label: b.label?.trim() || 'Feld', required: false, order };
  let def: unknown;
  switch (t.type) {
    case 'text':
      def = { ...base, type: 'text', config: {} };
      break;
    case 'checkbox': {
      const role = roleOf(b);
      def = { ...base, type: 'checkbox', ...(role ? { role } : {}), config: { withNote: true } };
      break;
    }
    case 'slider': {
      const role = roleOf(b);
      def = { ...base, type: 'slider', ...(role ? { role } : {}), config: sliderConfig(b, ctx) };
      break;
    }
    case 'multiselect':
      def = {
        ...base,
        ...(roleOf(b) ? { role: roleOf(b) } : {}),
        type: 'multiselect',
        config: { multiple: true, options: dedupeOptions(optionsOf(b)).map((o) => ({ id: optionIdFor(base.id, o.text), label: o.text, color: o.color })) },
      };
      break;
    case 'textarea':
      def = { ...base, type: 'textarea', config: { allowAttachments: true, allowEvents: true } };
      break;
    case 'bodymap':
      def = { ...base, type: 'bodymap', config: { defaultPresetId: defaultPresetOf(b, ctx) } };
      break;
    case 'date':
      def = { ...base, type: 'date', config: { mode: t.dateMode } };
      break;
  }
  return blockDefSchema.parse(def);
}

function dedupeOptions<T extends { text: string }>(opts: T[]): T[] {
  const seen = new Set<string>();
  return opts.filter((o) => (seen.has(o.text) ? false : (seen.add(o.text), true)));
}

/** Nebendatum-Blöcke: `range`, wenn irgendeine Momentaufnahme einen Zeitraum enthält (eine Version je Vorlage statt je Wert). */
function dateModesOf(snapshots: readonly (readonly V2Block[])[]): Map<string, 'datetime' | 'range'> {
  const modes = new Map<string, 'datetime' | 'range'>();
  for (const blocks of snapshots) {
    const skip = primaryDateIndex(blocks);
    blocks.forEach((b, i) => {
      if (i === skip || b.type !== 'date') return;
      if (parseDateValue(b.value)?.mode === 'range') modes.set(b.id, 'range');
      else if (!modes.has(b.id)) modes.set(b.id, 'datetime');
    });
  }
  return modes;
}

/** Blockdefinitionen einer Momentaufnahme (ohne primären Datum-Block), Order-Keys in v2-Reihenfolge. */
function defsOf(blocks: readonly V2Block[], ctx: DefContext): { defs: BlockDef[]; source: Map<string, V2Block> } {
  const skip = primaryDateIndex(blocks);
  const defs: BlockDef[] = [];
  const source = new Map<string, V2Block>();
  let prev: string | null = null;
  blocks.forEach((b, i) => {
    if (i === skip) return;
    const order = keyBetween(prev, null);
    const def = makeDef(b, order, ctx, b.type === 'date' ? (ctx.dateModes.get(b.id) ?? 'datetime') : undefined);
    if (!def) return;
    if (defs.some((d) => d.id === def.id)) {
      ctx.warnings.add(`„${ctx.templateName}“: doppelte Block-ID „${b.id}“ — zweites Vorkommen übersprungen`);
      return;
    }
    prev = order;
    defs.push(def);
    source.set(def.id, b);
  });
  return { defs, source };
}

// ---------------------------------------------------------------------------------------------------------------
// Werte

interface ValueContext {
  entryId: string;
  entryMs: number;
  date: string;
  templateName: string;
  opts: MigrationOptions;
  report: MigrationReport;
  attachments: MigratedAttachment[];
  images: Map<string, BodymapImage>;
}

const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)$/i;

function attachmentsFrom(files: unknown, vctx: ValueContext, blockId: string): string[] {
  if (!Array.isArray(files)) return [];
  const ids: string[] = [];
  files.forEach((f, i) => {
    const data = isObj(f) ? f.data : f;
    const m = typeof data === 'string' ? DATA_URL_RE.exec(data) : null;
    if (!m) {
      vctx.report.warnings.push(`${vctx.date} „${vctx.templateName}“: Anhang ${i + 1} ohne lesbare Daten übersprungen`);
      return;
    }
    const mime = m[1]!.toLowerCase();
    const key = isObj(f) && typeof f.id === 'string' ? f.id : String(i);
    const id = detId('attachment', `${vctx.entryId}/${blockId}/${key}`, vctx.entryMs);
    const name = isObj(f) && typeof f.name === 'string' && f.name.trim() ? f.name.trim() : mime === 'application/pdf' ? 'Dokument.pdf' : 'Foto';
    const createdAt = isObj(f) && typeof f.createdAt === 'string' && !Number.isNaN(Date.parse(f.createdAt)) ? iso(Date.parse(f.createdAt)) : iso(vctx.entryMs);
    vctx.attachments.push({
      id,
      diaryId: vctx.opts.diaryId,
      entryId: vctx.entryId,
      kind: mime === 'application/pdf' ? 'pdf' : 'image',
      mime,
      name,
      sizeBytes: Math.floor((m[2]!.length * 3) / 4) - (m[2]!.endsWith('==') ? 2 : m[2]!.endsWith('=') ? 1 : 0),
      createdAt,
      dataUrl: data as string,
    });
    ids.push(id);
  });
  return ids;
}

/** Legacy-`image`-Wert: JSON-Liste von Dateien oder eine einzelne Data-URL. */
function legacyImageFiles(v: unknown): unknown[] {
  const p = parseJson(v);
  if (Array.isArray(p)) return p;
  if (typeof v === 'string' && v.startsWith('data:')) return [{ data: v, name: 'Foto' }];
  return [];
}

function textareaValue(b: V2Block, def: BlockDef, vctx: ValueContext): unknown {
  if (b.type === 'image') {
    const ids = attachmentsFrom(legacyImageFiles(b.value), vctx, def.id);
    return ids.length ? { attachmentIds: ids } : undefined;
  }
  const v = typeof b.value === 'string' ? { text: b.value } : isObj(b.value) ? b.value : undefined;
  if (!v) return undefined;
  const out: { text?: string; events?: unknown[]; attachmentIds?: string[] } = {};
  if (typeof v.text === 'string' && v.text.trim()) out.text = v.text;
  if (Array.isArray(v.events)) {
    const events = v.events
      .filter((e): e is Record<string, unknown> => isObj(e) && typeof e.eventTitle === 'string' && e.eventTitle.trim() !== '')
      .map((e, i) => {
        const at = typeof e.timestamp === 'string' && !Number.isNaN(Date.parse(e.timestamp)) ? isoInZone(Date.parse(e.timestamp), vctx.opts.timezone) : undefined;
        return {
          id: detId('event', `${vctx.entryId}/${def.id}/${i}`, vctx.entryMs),
          category: e.eventCategory === 'doctor' ? 'doctor' : 'event',
          title: (e.eventTitle as string).trim(),
          ...(at ? { at } : {}),
        };
      });
    if (events.length) out.events = events;
  }
  const ids = attachmentsFrom(v.attachedFiles, vctx, def.id);
  if (ids.length) out.attachmentIds = ids;
  return Object.keys(out).length ? out : undefined;
}

function bodymapValue(b: V2Block, def: Extract<BlockDef, { type: 'bodymap' }>, vctx: ValueContext): unknown {
  const p = parseJson(b.value);
  if (!isObj(p)) return undefined;
  const points = Array.isArray(p.points) ? p.points.filter(isObj) : [];
  if (!points.length) return undefined;
  let presetId = def.config.defaultPresetId;
  if (typeof p.image === 'string' && p.image) {
    const r = vctx.opts.resolveImage(p.image, { defaultPresetId: def.config.defaultPresetId });
    if (!r) {
      vctx.report.warnings.push(`${vctx.date} „${vctx.templateName}“ / „${def.label}“: Body-Map-Bild nicht lesbar — Standardbild verwendet`);
    } else if ('presetId' in r) {
      presetId = r.presetId;
    } else {
      presetId = ownImage(p.image, r, vctx, def.label);
    }
  }
  return {
    presetId,
    points: points.map((pt, i) => {
      const id = detId('point', `${vctx.entryId}/${def.id}/${i}`, vctx.entryMs);
      const path = Array.isArray(pt.path)
        ? pt.path.filter((q): q is { x: number; y: number } => isObj(q) && typeof q.x === 'number' && typeof q.y === 'number').map((q) => ({ x: clamp01(q.x), y: clamp01(q.y) }))
        : [];
      const brush = pt.type === 'brush' && path.length >= 2;
      const first = path[0];
      const x = typeof pt.x === 'number' ? clamp01(pt.x) : (first?.x ?? 0.5);
      const y = typeof pt.y === 'number' ? clamp01(pt.y) : (first?.y ?? 0.5);
      const size = typeof pt.diameter === 'number' && pt.diameter > 0 ? Math.min(1, pt.diameter) : undefined;
      const comment = typeof pt.comment === 'string' && pt.comment.trim() ? pt.comment.slice(0, 2000) : undefined;
      return {
        id,
        x,
        y,
        ...(typeof pt.intensity === 'number' && pt.intensity >= 0 ? { intensity: pt.intensity } : {}),
        kind: brush ? 'brush' : 'point',
        ...(size ? { size } : {}),
        ...(comment ? { comment } : {}),
        ...(brush ? { path: thin(path) } : {}),
      };
    }),
  };
}

function thin<T>(path: T[]): T[] {
  if (path.length <= MAX_PATH) return path;
  const step = (path.length - 1) / (MAX_PATH - 1);
  return Array.from({ length: MAX_PATH }, (_, i) => path[Math.round(i * step)]!);
}

function ownImage(dataUrl: string, dims: { width: number; height: number }, vctx: ValueContext, label: string): string {
  const id = detId('bodymapImage', sha256Hex(dataUrl), MIGRATION_STRUCTURE_MS);
  if (!vctx.images.has(id)) {
    const r = bodymapImageSchema.safeParse({
      id,
      diaryId: vctx.opts.diaryId,
      name: `Aus v2 ${vctx.images.size + 1}`,
      dataUrl,
      width: Math.round(dims.width),
      height: Math.round(dims.height),
      createdAt: iso(MIGRATION_STRUCTURE_MS),
    });
    if (!r.success) {
      vctx.report.warnings.push(
        `${vctx.date} „${vctx.templateName}“ / „${label}“: eigenes Body-Map-Bild nicht übertragbar (${dataUrl.length > BODYMAP_IMAGE_MAX_CHARS ? 'zu groß' : 'Format'}) — Standardbild verwendet`,
      );
      return DEFAULT_BODYMAP_PRESET;
    }
    vctx.images.set(id, r.data);
  }
  return id;
}

function secondaryDateValue(b: V2Block, def: Extract<BlockDef, { type: 'date' }>, vctx: ValueContext): unknown {
  const d = parseDateValue(b.value);
  if (!d) return undefined;
  const span = dateSpan(d, vctx.opts.timezone);
  if (!span) return undefined;
  if (def.config.mode === 'range') {
    const endMs = span.endMs ?? span.startMs;
    return { start: isoInZone(span.startMs, vctx.opts.timezone), end: isoInZone(endMs, vctx.opts.timezone) };
  }
  return { at: isoInZone(span.startMs, vctx.opts.timezone) };
}

/** Beginn/Ende eines v2-Datumswerts; ohne Uhrzeit 12:00 lokal (Einzeldatum) bzw. 00:00–23:59 (Zeitraum). */
function dateSpan(d: DateValue, tz: string): { startMs: number; endMs?: number; allDay: boolean } | undefined {
  if (d.mode === 'single') {
    const ms = wallTimeToMs(d.startDate, d.time ?? '12:00', tz);
    return ms === undefined ? undefined : { startMs: ms, allDay: !d.time };
  }
  const end = isIsoDate(d.endDate) ? d.endDate : d.startDate;
  const timed = !!(d.startTime || d.endTime);
  const startMs = wallTimeToMs(d.startDate, d.startTime ?? '00:00', tz);
  const endMs = wallTimeToMs(end, d.endTime ?? (timed ? (d.startTime ?? '00:00') : '23:59'), tz);
  if (startMs === undefined || endMs === undefined) return undefined;
  return { startMs, endMs: Math.max(startMs, endMs), allDay: !timed };
}

function valueFor(b: V2Block, def: BlockDef, vctx: ValueContext): unknown {
  const v = b.value;
  switch (def.type) {
    case 'text': {
      const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
      return s && s.trim() ? s : undefined;
    }
    case 'checkbox': {
      if (typeof v === 'boolean') return v ? { checked: true } : undefined;
      if (typeof v === 'string') return v.trim() ? { checked: false, note: v } : undefined;
      if (!isObj(v)) return undefined;
      const checked = v.checked === true;
      const note = typeof v.text === 'string' && v.text.trim() ? v.text : undefined;
      return checked || note ? { checked, ...(note ? { note } : {}) } : undefined;
    }
    case 'slider': {
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (v === undefined || v === null || v === '') return undefined;
      const c = def.config;
      if (!Number.isFinite(n) || n < c.min || n > c.max || !isMultiple(n - c.min, c.step)) {
        unknown(vctx, def.label, String(v));
        return undefined;
      }
      return n;
    }
    case 'multiselect': {
      const raw = Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];
      const ids: string[] = [];
      for (const item of raw) {
        const label =
          typeof item === 'number' ? def.config.options[item]?.label : typeof item === 'string' ? item.trim() : undefined;
        const opt = label ? def.config.options.find((o) => o.label === label) : undefined;
        if (opt && !ids.includes(opt.id)) ids.push(opt.id);
        // unbekannte Werte wurden beim Ableiten der Version bereits als „(aus v2) …“-Option ergänzt
        else if (!opt && label) {
          const added = def.config.options.find((o) => o.label === `(aus v2) ${label}`);
          if (added && !ids.includes(added.id)) ids.push(added.id);
        }
      }
      return ids.length ? ids : undefined;
    }
    case 'textarea':
      return textareaValue(b, def, vctx);
    case 'bodymap':
      return bodymapValue(b, def, vctx);
    case 'date':
      return secondaryDateValue(b, def, vctx);
  }
}

function unknown(vctx: ValueContext, block: string, value: string) {
  vctx.report.unknownValues.push({ date: vctx.date, template: vctx.templateName, block, value });
}

/** Unbekannte Multiselect-Werte einer Momentaufnahme (Block-ID → Labels, die keine Option sind). */
function unknownLabels(defs: BlockDef[], source: Map<string, V2Block>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const def of defs) {
    if (def.type !== 'multiselect') continue;
    const raw = source.get(def.id)?.value;
    const items = Array.isArray(raw) ? raw : typeof raw === 'string' && raw ? [raw] : [];
    const labels: string[] = [];
    for (const item of items) {
      if (typeof item !== 'string' || !item.trim()) continue; // Indizes: gültig oder ignoriert
      const label = item.trim();
      if (!def.config.options.some((o) => o.label === label) && !labels.includes(label)) labels.push(label);
    }
    if (labels.length) out.set(def.id, labels);
  }
  return out;
}

/** „(aus v2) …“-Optionen an die Definitionen anhängen (MIG-07); Reihenfolge = erstes Auftreten. */
function withExtraOptions(defs: BlockDef[], extra: Map<string, string[]>): BlockDef[] {
  return defs.map((def) => {
    const labels = def.type === 'multiselect' ? extra.get(def.id) : undefined;
    if (def.type !== 'multiselect' || !labels?.length) return def;
    const added = labels.map((l) => `(aus v2) ${l}`).filter((l) => !def.config.options.some((o) => o.label === l));
    const options = [...def.config.options, ...added.map((label) => ({ id: optionIdFor(def.id, label), label, color: NEW_OPTION_COLOR }))];
    return { ...def, config: { ...def.config, options } };
  });
}

// ---------------------------------------------------------------------------------------------------------------

const signature = (defs: BlockDef[]) => canonical(defs);

function occurrence(blocks: readonly V2Block[], fallbackMs: number, tz: string): { occurredAt: string; period?: EntryPeriod } {
  const i = primaryDateIndex(blocks);
  const d = i >= 0 ? parseDateValue(blocks[i]!.value) : undefined;
  const span = d ? dateSpan(d, tz) : undefined;
  if (!d || !span) return { occurredAt: isoInZone(fallbackMs, tz) };
  const occurredAt = isoInZone(span.startMs, tz);
  if (d.mode === 'single') return { occurredAt };
  if (span.allDay) {
    const end = isIsoDate(d.endDate) && d.endDate >= d.startDate ? d.endDate : d.startDate;
    return { occurredAt, period: { start: d.startDate, end } };
  }
  return { occurredAt, period: { start: occurredAt, end: isoInZone(span.endMs ?? span.startMs, tz) } };
}

/** v2-Daten (entschlüsselt) → v3-Records eines Tagebuchs. Wirft nicht bei einzelnen kaputten Einträgen (MIG-13). */
export function transformV2(src: V2Source, opts: MigrationOptions): MigrationResult {
  const report: MigrationReport = {
    counts: { templates: 0, templateVersions: 0, entries: 0, attachments: 0, bodymapImages: 0, skippedDeleted: 0, undecryptable: 0 },
    undecryptable: [],
    unknownValues: [],
    warnings: [],
    blockMap: {},
  };
  const tz = opts.timezone;
  const warnings = new Set<string>();
  const attachments: MigratedAttachment[] = [];
  const images = new Map<string, BodymapImage>();
  const entries: Entry[] = [];
  const templatesOut: MigratedTemplate[] = [];

  // Einträge sammeln (gelöschte nicht, nicht entschlüsselbare in den Bericht)
  const live: (V2DecodedEntry & { blocks: V2Block[] })[] = [];
  for (const e of src.entries) {
    if (e.deleted) {
      report.counts.skippedDeleted++;
      continue;
    }
    if (!e.blocks) {
      report.undecryptable.push({ v2Id: e.id, date: e.timestamp, reason: e.decryptError ?? 'nicht entschlüsselbar' });
      continue;
    }
    if (!Array.isArray(e.blocks)) {
      report.undecryptable.push({ v2Id: e.id, date: e.timestamp, reason: 'Daten unlesbar' });
      continue;
    }
    // früh aussortieren: ein unlesbarer Zeitstempel würde sonst Sortierung und Vorlagen-Zeitpunkte verderben
    if (Number.isNaN(Date.parse(e.timestamp))) {
      report.undecryptable.push({ v2Id: e.id, date: e.timestamp, reason: 'ungültiger Zeitstempel' });
      continue;
    }
    live.push(e as V2DecodedEntry & { blocks: V2Block[] });
  }
  report.counts.undecryptable = report.undecryptable.length;

  // Vorlagen: vorhandene + für Einträge ohne Vorlage eine aus der jüngsten Momentaufnahme
  const byV2Id = new Map<number, V2Template>(src.templates.map((t) => [t.id, t]));
  const entriesByTemplate = new Map<number, typeof live>();
  for (const e of live) {
    const list = entriesByTemplate.get(e.templateId) ?? [];
    list.push(e);
    entriesByTemplate.set(e.templateId, list);
  }
  for (const [tid, list] of entriesByTemplate) {
    if (byV2Id.has(tid)) continue;
    const latest = [...list].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0]!;
    byV2Id.set(tid, { id: tid, name: `Vorlage ${tid} (aus v2)`, order: Number.MAX_SAFE_INTEGER, blocks: latest.blocks, deleted: true });
    warnings.add(`Einträge ohne vorhandene Vorlage (v2-ID ${tid}) → archivierte Vorlage „Vorlage ${tid} (aus v2)“`);
  }

  let prevOrder: string | null = opts.afterOrder ?? null;
  const sortedTemplates = [...byV2Id.values()].sort((a, b) => a.order - b.order || a.id - b.id);
  for (const t of sortedTemplates) {
    const tEntries = (entriesByTemplate.get(t.id) ?? []).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id - b.id);
    if (t.deleted && !tEntries.length) {
      report.counts.skippedDeleted++;
      continue;
    }
    const tKey = templateKey(t);
    const name = t.name?.trim() || `Vorlage ${t.id}`;
    const dateModes = dateModesOf([t.blocks ?? [], ...tEntries.map((e) => e.blocks)]);
    const ctx: DefContext = { tKey, blockMap: report.blockMap, warnings, templateName: name, dateModes };
    const templateId = detId('template', tKey, MIGRATION_STRUCTURE_MS);
    const currentBase = defsOf(t.blocks ?? [], ctx).defs;
    const currentSig = signature(currentBase);

    // Versionen: jede abweichende Momentaufnahme bekommt eine eigene Version (MIG-06), sortiert nach erstem Eintrag.
    // Unbekannte Multiselect-Werte erweitern die Version ihrer Einträge (keine eigene Version je Wert).
    const perEntry = tEntries.map((e) => {
      const { defs, source } = defsOf(e.blocks, ctx);
      return { e, defs, source, unknown: unknownLabels(defs, source), sig: signature(defs) };
    });
    const groups = new Map<string, { defs: BlockDef[]; firstMs: number; extra: Map<string, string[]> }>();
    groups.set(currentSig, { defs: currentBase, firstMs: Number.POSITIVE_INFINITY, extra: new Map() });
    for (const p of perEntry) {
      let g = groups.get(p.sig);
      if (!g) {
        g = { defs: p.defs, firstMs: Date.parse(p.e.timestamp), extra: new Map() };
        groups.set(p.sig, g);
      }
      for (const [blockId, labels] of p.unknown) {
        const list = g.extra.get(blockId) ?? [];
        for (const l of labels) if (!list.includes(l)) list.push(l);
        g.extra.set(blockId, list);
      }
    }
    const historical = [...groups.entries()]
      .filter(([sig]) => sig !== currentSig)
      .map(([sig, g]) => ({ sig, defs: withExtraOptions(g.defs, g.extra), firstMs: g.firstMs }));
    const current = withExtraOptions(currentBase, groups.get(currentSig)!.extra);
    const versionOf = new Map<string, number>(historical.map((h, i) => [h.sig, i + 1]));
    const currentVersion = historical.length + 1;
    versionOf.set(currentSig, currentVersion);

    const firstEntryMs = tEntries.length ? Date.parse(tEntries[0]!.timestamp) : undefined;
    const updatedMs = t.updatedAt && !Number.isNaN(Date.parse(t.updatedAt)) ? Date.parse(t.updatedAt) : (firstEntryMs ?? MIGRATION_STRUCTURE_MS);
    const createdMs = Math.min(updatedMs, firstEntryMs ?? updatedMs);
    const order = keyBetween(prevOrder, null);
    prevOrder = order;
    const template = templateSchema.parse({
      id: templateId,
      diaryId: opts.diaryId,
      name,
      ...(t.icon ? { icon: t.icon } : {}),
      ...(t.color ? { color: t.color } : {}),
      order,
      currentVersion,
      archived: !!t.deleted,
      createdAt: iso(createdMs),
      updatedAt: iso(Math.max(createdMs, updatedMs)),
    });
    const versions: TemplateVersion[] = [
      ...historical.map((h, i) => templateVersionSchema.parse({ templateId, version: i + 1, blocks: h.defs, createdAt: iso(h.firstMs) })),
      templateVersionSchema.parse({ templateId, version: currentVersion, blocks: current, createdAt: iso(Math.max(createdMs, updatedMs)) }),
    ];
    templatesOut.push({ template, versions });
    report.counts.templates++;
    report.counts.templateVersions += versions.length;

    for (const p of perEntry) {
      const { e } = p;
      const entryMs = Date.parse(e.timestamp);
      const id = detId('entry', entryKey(e), entryMs);
      const version = versions.find((v) => v.version === versionOf.get(p.sig))!;
      const date = e.timestamp.slice(0, 10);
      for (const [blockId, labels] of p.unknown) {
        const block = p.defs.find((d) => d.id === blockId)!.label;
        for (const value of labels) report.unknownValues.push({ date, template: name, block, value });
      }
      const vctx: ValueContext = { entryId: id, entryMs, date, templateName: name, opts, report, attachments: [], images };
      const values: Record<string, unknown> = {};
      for (const def of version.blocks) {
        const b = p.source.get(def.id);
        if (!b) continue;
        const v = valueFor(b, def, vctx);
        if (v !== undefined) values[def.id] = v;
      }
      const updatedRaw = e.updatedAt ?? e.editedAt;
      const updatedMsE = updatedRaw && !Number.isNaN(Date.parse(updatedRaw)) ? Math.max(entryMs, Date.parse(updatedRaw)) : entryMs;
      const { occurredAt, period } = occurrence(e.blocks, entryMs, tz);
      const candidate = {
        id,
        diaryId: opts.diaryId,
        templateId,
        templateVersion: version.version,
        occurredAt,
        ...(period ? { period } : {}),
        recordedAt: isoInZone(entryMs, tz),
        updatedAt: iso(updatedMsE),
        authorId: opts.authorId,
        values,
        tags: [],
        meta: { source: 'migration-v2', timezone: tz },
        hlc: formatHlc({ ms: updatedMsE, counter: 0, node: MIGRATION_HLC_NODE }),
      };
      const parsed = entrySchemaFor(version).safeParse(candidate);
      if (!parsed.success) {
        const issue = parsed.error.issues[0]!;
        report.undecryptable.push({ v2Id: e.id, date: e.timestamp, reason: `ungültig nach Umwandlung: ${issue.path.join('.')}: ${issue.message}` });
        report.counts.undecryptable++;
        continue;
      }
      entries.push(parsed.data);
      attachments.push(...vctx.attachments);
    }
  }

  report.warnings.unshift(...warnings);
  report.counts.entries = entries.length;
  report.counts.attachments = attachments.length;
  report.counts.bodymapImages = images.size;
  return { templates: templatesOut, entries, bodymapImages: [...images.values()], attachments, report };
}
