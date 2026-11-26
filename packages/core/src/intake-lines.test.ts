import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { instantiateCatalogTemplate } from './catalog.js';
import { keyBetween } from './fractional-index.js';
import { mapIntakeToValues } from './intake.js';
import { buildLinePrompt, parseGermanNumber, shortcutWarnings, SHORTCUT_LOCALE_LINE } from './intake-lines.js';
import type { BlockDef, TemplateVersion } from './templates.js';

const clock = { now: () => 1_700_000_000_000 };
const { newId } = createIdGenerator(clock);
const diaryId = newId();
const migraine = instantiateCatalogTemplate('migraine', { id: newId(), diaryId, order: 'V', newId }, clock);
const general = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId, order: 'W', newId }, clock);
const generalBlock = (label: string) => general.version.blocks.find((b) => b.label === label) as BlockDef;

// Synthetische Vorlage „Fuß“ (wie im Gerätetest): Slider, zwei Mehrfachauswahlen mit langen Optionen, Notizen.
const k0 = keyBetween(null, null);
const k1 = keyBetween(k0, null);
const k2 = keyBetween(k1, null);
const k3 = keyBetween(k2, null);
type Opt = string | [label: string, short: string];
const ms = (label: string, order: string, opts: Opt[], multiple = true, required = false): BlockDef => ({
  id: newId(), label, required, order, type: 'multiselect',
  config: {
    multiple,
    options: opts.map((o) => ({ id: newId(), label: Array.isArray(o) ? o[0] : o, ...(Array.isArray(o) ? { short: o[1] } : {}), color: '#ef4444' })),
  },
});
const pain: BlockDef = { ...generalBlock('Schmerzstärke'), id: newId(), order: k0, required: true };
const kind = ms('Schmerzart', k1, ['dumpf drückend', 'pochend', 'stechend', 'brennend', 'ziehend', 'Wundschmerz']);
const points = ms('Schmerzpunkte', k2, [
  'Os Trigonum', 'Achillessehne', 'Plantarfaszie', 'Narben', 'Zwischen Achillessehne und USG/OSG',
  ['neurolog. Ausfall Nerven kleine -4. Zehe Fußoberseite', 'Nervenausfall'],
]);
const notes: BlockDef = { ...generalBlock('Notizen'), id: newId(), order: k3 };
const foot: TemplateVersion = { templateId: newId(), version: 1, blocks: [pain, kind, points, notes], createdAt: new Date(0).toISOString() };
const opt = (b: BlockDef, label: string) => (b.type === 'multiselect' ? b.config.options.find((o) => o.label === label)!.id : '');
const map = (lines: string, v: TemplateVersion = foot) => mapIntakeToValues({ lines }, v);

describe('Kurzbefehl-Prompt im Zeilenformat', () => {
  it('VOI-25: Locale-Satz, Feldliste mit Name, Bereich und Optionen (inkl. Kurzname), endet mit „Diktat:“', () => {
    const p = buildLinePrompt('Fuß', foot);
    expect(p.split('\n')[0]).toBe(SHORTCUT_LOCALE_LINE);
    expect(p).toContain('Fuß');
    expect(p).toContain('Schmerzstärke: Zahl 0 bis 10');
    expect(p).toContain('Schmerzart: dumpf drückend, pochend, stechend, brennend, ziehend, Wundschmerz');
    expect(p).toContain('neurolog. Ausfall Nerven kleine -4. Zehe Fußoberseite (Nervenausfall)');
    expect(p).toMatch(/Notizen: alles Übrige/);
    expect(p.trimEnd().endsWith('Diktat:')).toBe(true);
  });

  it('VOI-25: keine IDs, keine Schema-Schlüssel, keine Uhrzeiten', () => {
    for (const v of [foot, migraine.version, general.version]) {
      const p = buildLinePrompt('X', v);
      for (const b of v.blocks) expect(p).not.toContain(b.id);
      for (const word of ['value', 'min', 'max', 'step', 'occurredAt', 'values', '{', '"']) expect(p).not.toContain(word);
      expect(p).not.toMatch(/\d{1,2}:\d{2}/);
      expect(p).not.toContain('Schmerzlokalisation'); // Körperkarte wird ausgelassen
    }
  });

  it('VOI-25: das Beispiel ist für jede Katalogvorlage gültig (Zeilen ergeben Werte ohne Fehler)', () => {
    const ids = ['general-pain', 'chronic-pain', 'migraine', 'headache', 'pain-medication'] as const;
    for (const id of ids) {
      const s = instantiateCatalogTemplate(id, { id: newId(), diaryId, order: 'X', newId }, clock);
      const p = buildLinePrompt(s.template.name, s.version);
      const lines = p.split('\nBeispiel\n')[1]!.split('\n').slice(1).filter((l) => l && l !== 'Diktat:');
      expect(lines.length).toBeGreaterThan(0);
      const r = map(lines.join('\n'), s.version);
      expect(r.errors).toEqual([]);
      expect(r.lineErrors).toEqual([]);
      expect(Object.keys(r.values).length).toBe(lines.length);
    }
    const fp = buildLinePrompt('Fuß', foot);
    const fl = fp.split('\nBeispiel\n')[1]!.split('\n').slice(1).filter((l) => l && l !== 'Diktat:');
    expect(map(fl.join('\n')).lineErrors).toEqual([]);
  });
});

describe('Zeilen-Auswertung', () => {
  it('VOI-26: Feldnamen tolerant, Zahlwörter, letzte Zeile gewinnt, Zeilen ohne Doppelpunkt ignoriert', () => {
    const r = map(['Das ist Unsinn ohne Doppelpunkt', '- schmerzstaerke: sechs', 'Schmerzart: pochend', 'Schmerzart: stechend'].join('\n'));
    expect(r.values[pain.id]).toBe(6);
    expect(r.values[kind.id]).toEqual([opt(kind, 'stechend')]);
    expect(r.lineErrors).toEqual([]);
    expect(map('Schmerzstärke: 7,5').values[pain.id]).toBeUndefined(); // Schritt 1 → ungültig
    expect(map('Schmerzstärke: zweiundzwanzig').lineErrors).toHaveLength(1); // außerhalb des Bereichs
    expect(parseGermanNumber('fünf')).toBe(5);
    expect(parseGermanNumber('zweiundsiebzig')).toBe(72);
    expect(parseGermanNumber('dreizehn')).toBe(13);
    expect(parseGermanNumber('Stärke 4')).toBe(4);
    expect(parseGermanNumber('0 bis 10')).toBeNaN(); // mehrdeutig
    expect(parseGermanNumber('sechseinhalb')).toBeNaN();
  });

  it('VOI-26: Mehrfachauswahl: ganze Optionsnamen zuerst (auch mit „und“), dann Komma/„und“; Kurznamen; Füllwörter', () => {
    const r = map('Schmerzpunkte: Zwischen Achillessehne und USG/OSG, an der Plantarfaszie und Narben');
    expect(r.lineErrors).toEqual([]);
    expect(r.values[points.id]).toEqual([opt(points, 'Zwischen Achillessehne und USG/OSG'), opt(points, 'Plantarfaszie'), opt(points, 'Narben')]);
    const s = map('Schmerzpunkte: Nervenausfall und Achillessehne');
    expect(s.values[points.id]).toEqual([opt(points, 'neurolog. Ausfall Nerven kleine -4. Zehe Fußoberseite'), opt(points, 'Achillessehne')]);
    // Modell schreibt „Name (Kurzname)“ ab → eine Option, kein Fehler
    expect(map('Schmerzpunkte: neurolog. Ausfall Nerven kleine -4. Zehe Fußoberseite (Nervenausfall)').values[points.id]).toEqual([
      opt(points, 'neurolog. Ausfall Nerven kleine -4. Zehe Fußoberseite'),
    ]);
  });

  it('VOI-26: unbekannte Zeilen landen nur in den Rohdaten, nicht in den Notizen; reservierte Zeilen', () => {
    const lines = ['Diktat: Stärke drei, es pocht', 'Sprachmodell: ja', 'Wetter: sonnig', 'Schmerzstärke: 3', 'Diktat: zweites Diktat'].join('\n');
    const r = map(lines);
    expect(r.values[pain.id]).toBe(3);
    expect(r.values[notes.id]).toBeUndefined();
    expect(r.unmatched).toEqual([]);
    expect(r.dictation).toEqual({ text: 'Stärke drei, es pocht', lines, model: 'ja' });
    // Beschreibung aus dem Prompt abgeschrieben (Gerätetest) → ignoriert statt Wert 0
    expect(map('Schmerzstärke: Zahl 0 bis 10').values[pain.id]).toBeUndefined();
  });

  it('VOI-26: Zeilen überschreiben alte `values`; ungültige Zeilen sind keine harten Fehler', () => {
    const r = mapIntakeToValues({ values: { Schmerzstärke: 2 }, lines: 'Schmerzstärke: 5\nSchmerzart: Ferse' }, foot);
    expect(r.values[pain.id]).toBe(5);
    expect(r.errors).toEqual([]);
    expect(r.lineErrors.map((e) => e.blockId)).toEqual([kind.id]);
  });
});

describe('Unscharfe Zuordnung', () => {
  it('VOI-27: ein ähnlicher Treffer → „Meintest du …?“, Antwort „ja“ übernimmt ihn (zustandslos aus den Zeilen)', () => {
    const r = map('Schmerzpunkte: Achillessehne, Plantafazie');
    expect(r.values[points.id]).toEqual([opt(points, 'Achillessehne')]);
    expect(r.lineErrors).toEqual([{ blockId: points.id, key: 'Schmerzpunkte', message: expect.stringContaining('Meintest du „Plantarfaszie“?'), candidates: ['Plantarfaszie'] }]);
    const yes = map('Schmerzpunkte: Achillessehne, Plantafazie\nSchmerzpunkte: ja');
    expect(yes.lineErrors).toEqual([]);
    expect(yes.values[points.id]).toEqual([opt(points, 'Achillessehne'), opt(points, 'Plantarfaszie')]);
    const no = map('Schmerzpunkte: Achillessehne, Plantafazie\nSchmerzpunkte: nein');
    expect(no.lineErrors).toEqual([]);
    expect(no.values[points.id]).toEqual([opt(points, 'Achillessehne')]);
  });

  it('VOI-27: mehrere Treffer → Kandidaten; kein Treffer → nur Hinweis; neue Antwort ersetzt', () => {
    const many = map('Schmerzart: dumpf');
    expect(many.lineErrors[0]!.candidates).toEqual(['dumpf drückend']);
    const r = map('Schmerzart: end');
    expect(r.lineErrors).toHaveLength(1);
    const two = map('Schmerzpunkte: Sehne');
    expect(two.lineErrors[0]!.candidates).toEqual(expect.arrayContaining(['Achillessehne']));
    expect(two.lineErrors[0]!.candidates.length).toBeGreaterThan(1);
    expect(two.lineErrors[0]!.message).toMatch(/Meintest du .* oder /);
    const none = map('Schmerzpunkte: Ferse');
    expect(none.lineErrors[0]).toMatchObject({ candidates: [], message: 'Option „Ferse“ gibt es nicht.' });
    expect(map('Schmerzpunkte: Ferse\nSchmerzpunkte: Achillessehne und Plantarfaszie').lineErrors).toEqual([]);
  });
});

describe('Prüfregeln „problematische Felder“', () => {
  it('VOI-28: lange Optionen, Abkürzungen/Ziffern/Sonderzeichen, „und“, ähnliche Optionen; Kurzname erledigt', () => {
    const w = shortcutWarnings('Fuß', foot);
    const forOpt = (label: string) => w.filter((x) => x.optionId === opt(points, label)).map((x) => x.kind);
    expect(forOpt('Zwischen Achillessehne und USG/OSG')).toEqual(expect.arrayContaining(['long-option', 'special-chars', 'and-in-option']));
    expect(forOpt('neurolog. Ausfall Nerven kleine -4. Zehe Fußoberseite')).toEqual([]); // hat Kurzname
    expect(forOpt('Achillessehne')).toContain('similar-options'); // steckt in „Zwischen Achillessehne …“
    expect(forOpt('Narben')).toEqual([]);
    expect(w.every((x) => x.message.length > 0)).toBe(true);
  });

  it('VOI-28: Feldname doppelt, mit Doppelpunkt oder reserviert; nicht befüllbare Typen nur als Info', () => {
    const dup: TemplateVersion = {
      ...foot,
      blocks: [...foot.blocks, { ...notes, id: newId(), label: 'notizen', order: keyBetween(k3, null) }, { ...notes, id: newId(), label: 'Diktat', order: 'b0' }, { ...notes, id: newId(), label: 'Zeit: morgens', order: 'b1' }],
    };
    const kinds = shortcutWarnings('Fuß', dup).map((x) => x.kind);
    expect(kinds).toEqual(expect.arrayContaining(['duplicate-field', 'reserved-field', 'colon-in-field']));
    const g = shortcutWarnings(general.template.name, general.version);
    expect(g.filter((x) => x.kind === 'not-fillable')).toEqual([expect.objectContaining({ severity: 'info', blockId: generalBlock('Schmerzlokalisation').id })]);
    expect(g.filter((x) => x.severity === 'warn')).toEqual([]);
  });

  it('VOI-28: zu große Vorlage für das Gerätemodell (Token-Schätzung)', () => {
    const big = ms('Riesig', 'b0', Array.from({ length: 400 }, (_, i) => `Option Nummer ${'x'.repeat(i % 7)} ${i}`));
    const w = shortcutWarnings('Groß', { ...foot, blocks: [...foot.blocks, big] });
    expect(w.some((x) => x.kind === 'too-large' && x.blockId === undefined)).toBe(true);
    expect(shortcutWarnings('Fuß', foot).some((x) => x.kind === 'too-large')).toBe(false);
  });
});
