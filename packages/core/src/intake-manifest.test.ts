import { describe, it, expect } from 'vitest';
import { createIdGenerator } from './ids.js';
import { instantiateCatalogTemplate } from './catalog.js';
import { buildShortcutBundle, buildShortcutManifest, checkIntake, manifestHash, versionFromBundle } from './intake-manifest.js';
import type { BlockDef } from './templates.js';

const clock = { now: () => 1_700_000_000_000 };
const { newId } = createIdGenerator(clock);
const diaryId = newId();
const migraine = instantiateCatalogTemplate('migraine', { id: newId(), diaryId, order: 'V', newId }, clock);
const general = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId, order: 'W', newId }, clock);
const byLabel = (label: string) => migraine.version.blocks.find((b) => b.label === label) as BlockDef;

describe('Kurzbefehl-Manifest', () => {
  it('VOI-18: enthält alle Vorlagen mit Feldern (Typ, Pflicht, Frage, Optionen, Bereich) und Prompt', () => {
    const m = buildShortcutManifest('Mein Tagebuch', [migraine, general], migraine.template.id);
    expect(m.v).toBe(1);
    expect(m.diary).toBe('Mein Tagebuch');
    expect(m.defaultTemplateId).toBe(migraine.template.id);
    expect(m.templates.map((t) => t.id)).toEqual([migraine.template.id, general.template.id]);
    const t = m.templates[0]!;
    expect(t.name).toBe(migraine.template.name);
    expect(t.version).toBe(migraine.version.version);
    expect(t.prompt).toContain(migraine.template.name);
    const pain = t.fields.find((f) => f.label === 'Schmerzstärke')!;
    expect(pain).toMatchObject({ id: byLabel('Schmerzstärke').id, type: 'slider', min: 0, max: 10 });
    expect(pain.question).toContain('Schmerzstärke');
    expect(typeof pain.required).toBe('boolean');
    const sym = t.fields.find((f) => f.label === 'Begleitsymptome')!;
    expect(sym.type).toBe('multiselect');
    expect(sym.options).toContain('Übelkeit');
    expect(sym.question).toContain('Begleitsymptome');
  });

  it('VOI-18: die Körperkarte fehlt (Feld und Bundle), archivierte und Trainingsvorlagen ebenfalls', () => {
    expect(general.version.blocks.some((b) => b.type === 'bodymap')).toBe(true);
    const archived = { ...migraine, template: { ...migraine.template, id: newId(), archived: true } };
    const training = { ...migraine, template: { ...migraine.template, id: newId(), purpose: 'training' as const } };
    const m = buildShortcutManifest('T', [general, archived, training], general.template.id);
    expect(m.templates.map((t) => t.id)).toEqual([general.template.id]);
    expect(m.templates[0]!.fields.some((f) => f.type === 'bodymap')).toBe(false);
    expect(m.templates[0]!.fields.map((f) => f.label)).toEqual(['Schmerzstärke', 'Notizen']);
    const bundle = buildShortcutBundle('T', [general], general.template.id);
    expect(bundle.blocks[general.template.id]!.some((b) => b.type === 'bodymap')).toBe(false);
  });

  it('VOI-18: der Hash ist stabil und ändert sich bei jeder Änderung der Vorlagenstruktur', () => {
    const a = buildShortcutBundle('T', [migraine, general], migraine.template.id);
    expect(manifestHash(buildShortcutBundle('T', [migraine, general], migraine.template.id))).toBe(manifestHash(a));
    const renamed = { ...migraine, version: { ...migraine.version, blocks: migraine.version.blocks.map((b) => (b.label === 'Dauer (Stunden)' ? { ...b, label: 'Dauer' } : b)) } };
    expect(manifestHash(buildShortcutBundle('T', [renamed, general], migraine.template.id))).not.toBe(manifestHash(a));
    expect(manifestHash(buildShortcutBundle('Anderer Name', [migraine, general], migraine.template.id))).not.toBe(manifestHash(a));
  });
});

describe('Kurzbefehl-Prüfung (Dry-Run)', () => {
  const pain = byLabel('Schmerzstärke');

  it('VOI-21: liefert fehlende und ungültige Felder und eine vorlesbare Zusammenfassung', () => {
    const r = checkIntake({ values: { Schmerzstärke: 11, Begleitsymptome: ['Übelkeit'] } }, migraine.version);
    expect(r.invalid).toEqual([{ field: pain.id, message: expect.any(String) }]);
    expect(r.missing.map((f) => f.id)).not.toContain(pain.id);
    expect(r.missing.map((f) => f.id)).not.toContain(byLabel('Begleitsymptome').id);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.summary).toContain('Begleitsymptome');
    expect(r.summary).toContain('Übelkeit');
    expect(r.summary).not.toContain('Schmerzstärke');
  });

  it('VOI-21: ohne Angaben fehlt alles, mit allen Pflichtangaben fehlt keine Pflicht', () => {
    const empty = checkIntake({}, migraine.version);
    expect(empty.invalid).toEqual([]);
    expect(empty.missing.map((f) => f.id)).toContain(pain.id);
    expect(empty.summary).toMatch(/keine Angaben/i);
    const required = migraine.version.blocks.filter((b) => b.required && b.type !== 'bodymap');
    const values = Object.fromEntries(required.map((b) => [b.id, b.type === 'slider' ? 3 : b.type === 'checkbox' ? true : 'x']));
    const r = checkIntake({ values }, migraine.version);
    expect(r.missing.filter((f) => f.required)).toEqual([]);
  });

  it('VOI-21: Zusammenfassung nutzt die Anzeigewerte (displayValue)', () => {
    const r = checkIntake({ values: { Schmerzstärke: 7 } }, migraine.version);
    expect(r.summary).toContain('Schmerzstärke: 7');
  });

  it('VOI-21: das Bundle der Vorlage reicht für die Prüfung (versionFromBundle)', () => {
    const b = buildShortcutBundle('T', [migraine], migraine.template.id);
    const v = versionFromBundle(b, migraine.template.id)!;
    expect(checkIntake({ values: { Schmerzstärke: 4 } }, v).summary).toContain('Schmerzstärke: 4');
    expect(versionFromBundle(b, 'gibt-es-nicht')).toBeNull();
  });
});

describe('Kurzbefehl im Zeilenformat (FEAT-024)', () => {
  const required = migraine.version.blocks.filter((b) => b.required && b.type !== 'bodymap');
  const reqVersion = { ...migraine.version, blocks: migraine.version.blocks.map((b) => (b.label === 'Schmerzstärke' ? { ...b, required: true } : b)) };

  it('VOI-29: `questions` je Modus: nur Pflichtfelder bzw. alle leeren Felder; Fragen nennen die Optionen', () => {
    const all = checkIntake({ lines: 'Sprachmodell: ja\nBegleitsymptome: Übelkeit' }, reqVersion, { ask: 'all' });
    expect(all.questions.map((q) => q.label)).toContain('Schmerzstärke');
    expect(all.questions.map((q) => q.label)).not.toContain('Begleitsymptome');
    const trig = all.questions.find((q) => q.label === 'Auslöser')!;
    expect(trig.question).toContain('Stress');
    const req = checkIntake({ lines: 'Sprachmodell: ja\nBegleitsymptome: Übelkeit' }, reqVersion, { ask: 'required' });
    expect(req.questions.map((q) => q.label)).toEqual(['Schmerzstärke']);
    expect(required.length).toBeGreaterThanOrEqual(0);
  });

  it('VOI-29: ohne Sprachmodell werden alle leeren Felder gefragt, auch im Modus „nur Pflicht“', () => {
    const r = checkIntake({ lines: 'Diktat: irgendwas\nSprachmodell: nein' }, reqVersion, { ask: 'required' });
    expect(r.questions.length).toBe(reqVersion.blocks.filter((b) => b.type !== 'bodymap').length);
  });

  it('VOI-29: ungültige Zeilen zuerst, mit Meldung und Kandidaten; Zusammenfassung ohne sie', () => {
    const r = checkIntake({ lines: 'Schmerzstärke: 4\nBegleitsymptome: Übelkeid' }, reqVersion, { ask: 'required' });
    expect(r.invalid).toEqual([{ field: byLabel('Begleitsymptome').id, message: expect.stringContaining('Meintest du „Übelkeit“?'), candidates: ['Übelkeit'] }]);
    expect(r.questions[0]).toEqual({ label: 'Begleitsymptome', question: expect.stringMatching(/^Option „Übelkeid“ gibt es nicht\. Meintest du „Übelkeit“\? Begleitsymptome: /) });
    expect(r.summary).toBe('Schmerzstärke: 4.');
    const fixed = checkIntake({ lines: 'Schmerzstärke: 4\nBegleitsymptome: Übelkeid\nBegleitsymptome: ja' }, reqVersion, { ask: 'required' });
    expect(fixed.invalid).toEqual([]);
    expect(fixed.summary).toContain('Übelkeit');
  });

  it('VOI-31: Manifest trägt den Nachfragen-Modus; Modus und Kurznamen ändern den Hash', () => {
    const a = buildShortcutBundle('T', [migraine], migraine.template.id);
    expect(a.manifest.ask).toBe('all');
    const req = buildShortcutBundle('T', [migraine], migraine.template.id, 'required');
    expect(req.manifest.ask).toBe('required');
    expect(manifestHash(req)).not.toBe(manifestHash(a));
    const shortened = {
      ...migraine,
      version: {
        ...migraine.version,
        blocks: migraine.version.blocks.map((b) =>
          b.type === 'multiselect' && b.label === 'Begleitsymptome' ? { ...b, config: { ...b.config, options: b.config.options.map((o, i) => (i === 0 ? { ...o, short: 'Kurz' } : o)) } } : b,
        ),
      },
    };
    const s = buildShortcutBundle('T', [shortened], migraine.template.id);
    expect(manifestHash(s)).not.toBe(manifestHash(a));
    expect(s.manifest.templates[0]!.prompt).toContain('(Kurz)');
  });
});
