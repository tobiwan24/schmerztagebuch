// Kurzbefehl im Zeilenformat (FEAT-024, Spec 08 „Zeilenformat"): Prompt je Vorlage (Zeilen „Feld: Wert" statt JSON),
// Hilfen zum Auswerten der Zeilen (tolerante Namen, Zahlwörter, Optionen mit unscharfer Zuordnung) und Prüfregeln für
// Felder, die sich schlecht sprechen oder erkennen lassen. Pure Logik ohne Uhr; die eigentliche Abbildung macht `intake.ts`.
import { compareByOrder } from './fractional-index.js';
import type { BlockDef, TemplateVersion } from './templates.js';

/** Erste Zeile jedes Prompts (Apple-Empfehlung: Locale nennen). */
export const SHORTCUT_LOCALE_LINE = "The person's locale is de_DE.";
/** Reservierte Zeilen, die der Kurzbefehl selbst schreibt: Rohdiktat und Antwort der Importfrage „Sprachmodell verwenden?“. */
export const RESERVED_LINES = { dictation: 'Diktat', model: 'Sprachmodell' } as const;
/** Grobe Obergrenze für den Prompt (Gerätemodell: 4.096 Token für Prompt, Diktat und Antwort zusammen). */
export const PROMPT_TOKEN_LIMIT = 2000;

/** Groß/Klein-, Umlaut- und Satzzeichen-tolerante Form eines Labels („Übelkeit" = „uebelkeit" = „ubelkeit"). */
export function normalizeLabel(s: string): string {
  return softNorm(s).replace(/ /g, '');
}

/** Wie `normalizeLabel`, aber Wortgrenzen bleiben als einzelne Leerzeichen erhalten; `keep` lässt Zeichen stehen (Trenner). */
export function softNorm(s: string, keep = ''): string {
  const strip = new RegExp(`[^a-z0-9${keep.replace(/[\]\\^-]/g, '\\$&')}]+`, 'g');
  return s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(strip, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

const UNITS: Record<string, number> = { null: 0, ein: 1, eins: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const TEENS: Record<string, number> = { zehn: 10, elf: 11, zwolf: 12, dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const TENS: Record<string, number> = { zwanzig: 20, dreissig: 30, vierzig: 40, funfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };

function numberWord(w: string): number | undefined {
  if (w in UNITS) return UNITS[w];
  if (w in TEENS) return TEENS[w];
  if (w in TENS) return TENS[w];
  if (w === 'hundert' || w === 'einhundert') return 100;
  const m = /^(\w+?)und(\w+)$/.exec(w);
  if (m && m[1]! in UNITS && m[2]! in TENS && UNITS[m[1]!]! > 0) return UNITS[m[1]!]! + TENS[m[2]!]!;
  return undefined;
}

/** Genau eine Zahl im Text (Ziffern mit Komma/Punkt oder deutsches Zahlwort bis 100); keine oder mehrere → NaN. */
export function parseGermanNumber(s: string): number {
  const digits = s.match(/-?\d+(?:[.,]\d+)?/g) ?? [];
  if (digits.length > 1) return NaN;
  if (digits.length === 1) return Number(digits[0]!.replace(',', '.'));
  const words = softNorm(s).split(' ').map(numberWord).filter((n): n is number => n !== undefined);
  return words.length === 1 ? words[0]! : NaN;
}

const YES = new Set(['ja', 'jawohl', 'genau', 'richtig', 'ja genau', 'ja bitte', 'stimmt']);
const NO = new Set(['nein', 'ne', 'nee', 'falsch', 'nein danke']);
export const isYes = (s: string): boolean => YES.has(softNorm(s));
export const isNo = (s: string): boolean => NO.has(softNorm(s));

const MONTHS = ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
/** Vollständiges Datum („2026-11-26“, „26.11.2026“, „26. November 2026“) → ISO-Datum, sonst `undefined`. */
export function parseGermanDate(s: string): string | undefined {
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return iso[0];
  const dotted = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(s);
  if (dotted) return `${dotted[3]}-${pad(Number(dotted[2]))}-${pad(Number(dotted[1]))}`;
  const named = /(\d{1,2})\.?\s+([a-z]+)\s+(\d{4})/.exec(softNorm(s));
  const month = named ? MONTHS.indexOf(named[2]!) : -1;
  return named && month >= 0 ? `${named[3]}-${pad(month + 1)}-${pad(Number(named[1]))}` : undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Optionen auflösen

export interface NamedOption {
  id: string;
  label: string;
  names: string[];
}

const FILLER = new Set(['an', 'der', 'die', 'das', 'dem', 'den', 'des', 'am', 'im', 'in', 'auf', 'mit', 'bei', 'beim', 'zum', 'zur', 'etwas', 'auch', 'noch', 'und', 'sowie', 'oder', 'ein', 'eine', 'einer', 'es', 'ist', 'war', 'leicht', 'stark']);

/** Optionen, die einem nicht erkannten Wort ähneln (Tippfehler/Erkennungsfehler, Teilwort, Wortanfang). */
export function similarOptions(token: string, options: readonly NamedOption[]): string[] {
  const t = normalizeLabel(token);
  if (!t) return [];
  const out: string[] = [];
  for (const o of options) {
    const hit = o.names.some((n) => {
      const nl = normalizeLabel(n);
      if (levenshtein(t, nl) <= Math.max(1, Math.floor(nl.length / 4))) return true;
      if (t.length >= 4 && (nl.includes(t) || t.includes(nl))) return true;
      return softNorm(n).split(' ').some((w) => w.length >= 4 && levenshtein(w, t) <= 1);
    });
    if (hit && !out.includes(o.label)) out.push(o.label);
  }
  return out;
}

/**
 * Optionen aus gesprochenem Text: erst ganze Options- und Kurznamen (längste zuerst, auch mit „und“ im Namen), dann den
 * Rest an Komma/Semikolon/„und“/„sowie“ trennen und Füllwörter verwerfen. Nicht erkannte Teile → `unknown`.
 */
export function resolveOptions(text: string, options: readonly NamedOption[]): { ids: string[]; unknown: string[] } {
  let rest = ` ${softNorm(text, ',;').replace(/\s*[,;]\s*/g, ' , ')} `;
  const hits: { id: string; at: number }[] = [];
  const names = options
    .flatMap((o) => o.names.map((n) => ({ id: o.id, n: softNorm(n) })))
    .filter((x) => x.n)
    .sort((a, b) => b.n.length - a.n.length);
  for (const { id, n } of names) {
    const needle = ` ${n} `;
    // Gleich lang ersetzen, damit die Positionen (Reihenfolge wie gesprochen) erhalten bleiben.
    for (let at = rest.indexOf(needle); at >= 0; at = rest.indexOf(needle)) {
      rest = `${rest.slice(0, at)} ,${' '.repeat(n.length - 1)} ${rest.slice(at + needle.length)}`;
      hits.push({ id, at });
    }
  }
  const unknown: string[] = [];
  let offset = 0;
  for (const segment of rest.split(/(,|\bund\b|\bsowie\b|\boder\b)/)) {
    const at = offset;
    offset += segment.length;
    const words = segment.trim().split(' ').filter((w) => /[a-z0-9]/.test(w) && !FILLER.has(w));
    if (!words.length) continue;
    const token = words.join(' ');
    const exact = options.find((o) => o.names.some((n) => normalizeLabel(n) === normalizeLabel(token)));
    if (exact) hits.push({ id: exact.id, at });
    else unknown.push(originalWords(token, text));
  }
  const ids: string[] = [];
  for (const h of hits.sort((a, b) => a.at - b.at)) if (!ids.includes(h.id)) ids.push(h.id);
  return { ids, unknown };
}

/** Normalisiertes Wortstück → Schreibweise im Original (für vorlesbare Meldungen „Option „Ferse“ gibt es nicht“). */
function originalWords(token: string, text: string): string {
  const words = text.split(/[\s,;]+/).filter(Boolean);
  const n = token.split(' ').length;
  for (let i = 0; i + n <= words.length; i++) {
    const run = words.slice(i, i + n);
    if (softNorm(run.join(' ')) === token) return run.join(' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  }
  return token;
}

// ---------------------------------------------------------------------------------------------------------------
// Prompt

const NOT_FILLABLE: ReadonlySet<BlockDef['type']> = new Set(['bodymap', 'exercise']);

/** Blöcke, die der Kurzbefehl per Sprache befüllen kann (ohne Körperkarte, Übung, Zeitpunkt/Zeitraum). */
export function voiceFillable(b: BlockDef): boolean {
  if (NOT_FILLABLE.has(b.type)) return false;
  return !(b.type === 'date' && (b.config.mode === 'datetime' || b.config.mode === 'range'));
}

export const optionNames = (o: { label: string; short?: string }): string[] => (o.short ? [o.label, o.short] : [o.label]);
const optionText = (o: { label: string; short?: string }) => (o.short ? `${o.label} (${o.short})` : o.label);

const firstNoteId = (blocks: readonly BlockDef[]) => blocks.find((b) => b.type === 'textarea')?.id;

/** Beschreibung eines Felds im Prompt; dieselbe Zeile, abgeschrieben, wird beim Auswerten ignoriert. */
export function fieldHint(b: BlockDef, blocks: readonly BlockDef[]): string {
  switch (b.type) {
    case 'slider':
      return `Zahl ${b.config.min} bis ${b.config.max}${b.config.unit ? ` ${b.config.unit}` : ''}`;
    case 'multiselect': {
      const names = b.config.options.map(optionText);
      return b.config.multiple || names.length < 2 ? names.join(', ') : `${names.slice(0, -1).join(', ')} oder ${names.at(-1)}`;
    }
    case 'checkbox':
      return 'ja oder nein';
    case 'medication':
      return [...b.config.presets.map((p) => p.name), ...(b.config.allowFree ? ['andere Namen'] : [])].join(', ');
    case 'date':
      return b.config.mode === 'duration' ? 'Minuten als Zahl' : 'Datum, Tag Monat Jahr';
    case 'textarea':
      return b.id === firstNoteId(blocks) ? 'alles Übrige' : 'Text';
    default:
      return 'Text';
  }
}

const SPOKEN = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];

/** Gültiges Beispiel aus der Vorlage: erster Slider, erste Option der ersten Auswahl, Rest als Notiz. */
function example(blocks: readonly BlockDef[]): { dictation: string; lines: string[] } {
  const spoken: string[] = [];
  const lines: string[] = [];
  const slider = blocks.find((b): b is Extract<BlockDef, { type: 'slider' }> => b.type === 'slider');
  if (slider) {
    const { min, max, step } = slider.config;
    const n = Math.min(max, min + step * 3);
    spoken.push(`${slider.label} ${Number.isInteger(n) && n >= 0 && n < SPOKEN.length ? SPOKEN[n] : n}`);
    lines.push(`${slider.label}: ${n}`);
  }
  const select = blocks.find((b): b is Extract<BlockDef, { type: 'multiselect' }> => b.type === 'multiselect' && b.config.options.length > 0);
  if (select) {
    const o = select.config.options[0]!;
    spoken.push(o.short ?? o.label);
    lines.push(`${select.label}: ${o.short ?? o.label}`);
  }
  const check = !slider && !select ? blocks.find((b) => b.type === 'checkbox') : undefined;
  if (check) {
    spoken.push(`${check.label} ja`);
    lines.push(`${check.label}: ja`);
  }
  const note = blocks.find((b) => b.id === firstNoteId(blocks));
  if (note) {
    spoken.push('nach dem Spaziergang');
    lines.push(`${note.label}: nach dem Spaziergang`);
  }
  return { dictation: spoken.join(', '), lines };
}

/** Prompt für das Modell im Kurzbefehl: Zeilen „Feld: Wert“, keine IDs, keine Schema-Schlüssel (FEAT-024). */
export function buildLinePrompt(templateName: string, version: TemplateVersion): string {
  const blocks = [...version.blocks].sort(compareByOrder).filter(voiceFillable);
  const ex = example(blocks);
  return [
    SHORTCUT_LOCALE_LINE,
    `Schreibe aus dem Diktat die Angaben für „${templateName}“ heraus. Eine Zeile pro Feld, Form „Feld: Wert“. Erfinde nichts, lass Felder ohne Angabe weg.`,
    'Felder:',
    ...blocks.map((b) => `${b.label}: ${fieldHint(b, blocks)}`),
    ...(ex.lines.length ? ['', 'Beispiel', `Diktat: ${ex.dictation}`, ...ex.lines] : []),
    '',
    'Diktat:',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Prüfregeln

export type ShortcutWarningKind =
  | 'long-option' | 'special-chars' | 'and-in-option' | 'similar-options'
  | 'duplicate-field' | 'colon-in-field' | 'reserved-field' | 'too-large' | 'not-fillable';

export interface ShortcutWarning {
  kind: ShortcutWarningKind;
  severity: 'warn' | 'info';
  /** Fehlt bei Meldungen, die die ganze Vorlage betreffen (zu groß). */
  blockId?: string;
  optionId?: string;
  message: string;
}

const MESSAGES: Record<ShortcutWarningKind, (name: string, other?: string) => string> = {
  'long-option': (n) => `Option „${n}“ ist lang (mehr als 3 Wörter oder 25 Zeichen). Ein Kurzname hilft.`,
  'special-chars': (n) => `Option „${n}“ enthält Abkürzungen, Ziffern oder Sonderzeichen, die sich schlecht sprechen lassen. Ein Kurzname hilft.`,
  'and-in-option': (n) => `Option „${n}“ enthält „und“ und kann mit zwei Optionen verwechselt werden. Ein Kurzname hilft.`,
  'similar-options': (n, o) => `Option „${n}“ klingt ähnlich wie „${o}“ oder überschneidet sich damit. Ein Kurzname hilft.`,
  'duplicate-field': (n) => `Den Feldnamen „${n}“ gibt es mehrfach. Das Modell kann die Felder nicht unterscheiden.`,
  'colon-in-field': (n) => `Feldname „${n}“ enthält einen Doppelpunkt. Das stört das Zeilenformat „Feld: Wert“.`,
  'reserved-field': (n) => `Feldname „${n}“ ist für den Kurzbefehl reserviert und wird nicht befüllt.`,
  'too-large': () => 'Die Vorlage ist für das Modell auf dem Gerät vermutlich zu groß. „Modell verwenden“ kann abbrechen.',
  'not-fillable': (n) => `Feld „${n}“ kann per Kurzbefehl nicht befüllt werden und wird übersprungen.`,
};

/** Grobe Token-Schätzung (deutsch ≈ 3 Zeichen je Token). */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 3);

/** Felder und Optionen einer Vorlage, die per Sprache/Modell problematisch sind (FEAT-024). Option mit Kurzname gilt als erledigt. */
export function shortcutWarnings(templateName: string, version: TemplateVersion): ShortcutWarning[] {
  const out: ShortcutWarning[] = [];
  const push = (kind: ShortcutWarningKind, name: string, ids: { blockId?: string; optionId?: string }, other?: string) =>
    out.push({ kind, severity: kind === 'not-fillable' ? 'info' : 'warn', ...ids, message: MESSAGES[kind](name, other) });
  const blocks = [...version.blocks].sort(compareByOrder);
  const reserved = new Set(Object.values(RESERVED_LINES).map(normalizeLabel));
  const seen = new Map<string, number>();
  for (const b of blocks) seen.set(normalizeLabel(b.label), (seen.get(normalizeLabel(b.label)) ?? 0) + 1);
  for (const b of blocks) {
    if (!voiceFillable(b)) {
      push('not-fillable', b.label, { blockId: b.id });
      continue;
    }
    if ((seen.get(normalizeLabel(b.label)) ?? 0) > 1) push('duplicate-field', b.label, { blockId: b.id });
    if (b.label.includes(':')) push('colon-in-field', b.label, { blockId: b.id });
    if (reserved.has(normalizeLabel(b.label))) push('reserved-field', b.label, { blockId: b.id });
    if (b.type !== 'multiselect') continue;
    for (const o of b.config.options) {
      if (o.short) continue;
      const ids = { blockId: b.id, optionId: o.id };
      if (o.label.trim().split(/\s+/).length > 3 || o.label.length > 25) push('long-option', o.label, ids);
      if (/[^\p{L}\s]/u.test(o.label)) push('special-chars', o.label, ids);
      if (/(^|\s)und(\s|$)/i.test(o.label)) push('and-in-option', o.label, ids);
      const n = normalizeLabel(o.label);
      const similar = b.config.options.find((x) => {
        if (x.id === o.id) return false;
        const m = normalizeLabel(x.short ?? x.label);
        return levenshtein(n, m) <= Math.max(1, Math.floor(Math.min(n.length, m.length) / 5)) || (Math.min(n.length, m.length) >= 4 && (n.includes(m) || m.includes(n)));
      });
      if (similar) push('similar-options', o.label, ids, similar.short ?? similar.label);
    }
  }
  if (estimateTokens(buildLinePrompt(templateName, version)) > PROMPT_TOKEN_LIMIT) push('too-large', templateName, {});
  return out;
}
