// Repository-Integrationstests. Laufen unverändert mit Codec `plain` und Test-Codec `aes` (DM-09).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIdGenerator, createTemplate, displayValue, keyBetween, updateTemplate, type BlockDef, type Entry, type TemplateState } from '@stb/core';
import { generateDiaryKey } from '@stb/crypto';
import { StbDb } from '../db.js';
import { plainCodec } from '../codec/plain.js';
import { createAesCodec } from '../codec/aes.js';
import { createCodecRegistry } from '../codec/registry.js';
import { createRecordRepository } from './records.js';
import { createDiaryRepository, type DiaryRepository } from './diary.js';

let t = 1_700_000_000_000;
const clock = { now: () => (t += 1000) };
const { newId } = createIdGenerator(clock);
const iso = () => new Date(clock.now()).toISOString();

/** Einzige Felder, die außerhalb von payload/base stehen dürfen (Spec 02, DM-09). */
const ALLOWED_OUTSIDE = new Set(['id', 'diaryId', 'kind', 'rev', 'deleted', 'codec', 'localUpdatedAt', 'occurredAt', 'payload', 'base']);

let db: StbDb;
let n = 0;
beforeEach(async () => {
  db = new StbDb(`stb-v3-diary-${++n}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

for (const codecId of ['plain', 'aes'] as const) {
  describe(`Diary-Repository (Codec ${codecId})`, () => {
    let repo: DiaryRepository;
    const diaryId = newId();

    beforeEach(async () => {
      const registry = createCodecRegistry([plainCodec, createAesCodec(await generateDiaryKey(), () => 1)]);
      repo = createDiaryRepository(createRecordRepository(db, { registry, writeCodec: codecId, clock, outbox: true }));
    });

    function template(): { state: TemplateState; pain: BlockDef; note: BlockDef; sleep: BlockDef } {
      const k1 = keyBetween(null, null);
      const k2 = keyBetween(k1, null);
      const k3 = keyBetween(k2, null);
      const pain: BlockDef = { id: newId(), type: 'slider', label: 'Schmerz', required: true, role: 'outcome', order: k1, config: { min: 0, max: 10, step: 1 } };
      const sleep: BlockDef = { id: newId(), type: 'slider', label: 'Schlaf', required: false, order: k2, config: { min: 0, max: 10, step: 1 } };
      const note: BlockDef = { id: newId(), type: 'text', label: 'Notiz', required: false, order: k3, config: {} };
      return { state: createTemplate({ id: newId(), diaryId, name: 'Kopfschmerz', order: k1, blocks: [pain, sleep, note] }, clock), pain, note, sleep };
    }

    function entry(state: TemplateState, values: Record<string, unknown>): Entry {
      const now = iso();
      return {
        id: newId(), diaryId, templateId: state.template.id, templateVersion: state.version.version,
        occurredAt: now, recordedAt: now, updatedAt: now, authorId: 'user-1', values, tags: ['STB-PLAINTEXT-MARKER-3'],
        meta: { source: 'app', timezone: 'Europe/Berlin' }, hlc: '0000000000001:0000:dev1',
      };
    }

    it(`DM-09 (${codecId}): Vorlage und Eintrag speichern und lesen`, async () => {
      const { state, pain, note } = template();
      await repo.saveTemplate(state);
      expect(await repo.getTemplate(state.template.id)).toEqual(state);
      expect((await repo.listTemplates(diaryId)).map((x) => x.id)).toEqual([state.template.id]);
      const e = entry(state, { [pain.id]: 7, [note.id]: 'STB-PLAINTEXT-MARKER-4' });
      await repo.saveEntry(e);
      expect(await repo.getEntry(e.id)).toEqual(e);
      expect((await repo.listEntries(diaryId)).map((x) => x.id)).toEqual([e.id]);
    });

    it(`DM-09 (${codecId}): ungültiger Eintrag wird abgelehnt, nichts wird geschrieben`, async () => {
      const { state, pain } = template();
      await repo.saveTemplate(state);
      const before = await db.records.count();
      await expect(repo.saveEntry(entry(state, { [pain.id]: 99 }))).rejects.toThrow();
      await expect(repo.saveEntry(entry(state, { [newId()]: 1 }))).rejects.toThrow();
      expect(await db.records.count()).toBe(before);
    });

    it(`DM-09 (${codecId}): außerhalb von payload/base stehen nur erlaubte Felder`, async () => {
      const { state, pain } = template();
      await repo.saveTemplate(state);
      await repo.saveEntry(entry(state, { [pain.id]: 2 }));
      for (const rec of await db.records.toArray()) {
        for (const key of Object.keys(rec)) expect(ALLOWED_OUTSIDE.has(key), `${rec.kind}.${key}`).toBe(true);
      }
    });

    it(`DM-08 (${codecId}): Eintrag mit Version 1 wird nach Entfernen eines Blocks in Version 2 vollständig angezeigt`, async () => {
      const { state, pain, sleep, note } = template();
      await repo.saveTemplate(state);
      const e = entry(state, { [pain.id]: 6, [sleep.id]: 3, [note.id]: 'x' });
      await repo.saveEntry(e);
      const v2 = updateTemplate(state, { blocks: [pain, note] }, clock, [state.version]).state;
      await repo.saveTemplate(v2);
      expect((await repo.getTemplate(state.template.id))?.version.version).toBe(2);
      expect(await repo.getTemplateVersion(state.template.id, 1)).toEqual(state.version);
      const view = await repo.getEntryView(e.id);
      expect(view?.fields.map((f) => [f.block.label, f.value, f.archived])).toEqual([
        ['Schmerz', 6, false],
        ['Notiz', 'x', false],
        ['Schlaf', 3, true],
      ]);
    });

    it(`BLK-06 (${codecId}): Umsortieren der Blöcke erzeugt eine neue Version; alte Einträge werden korrekt dargestellt`, async () => {
      const { state, pain, sleep, note } = template();
      await repo.saveTemplate(state);
      const e = entry(state, { [pain.id]: 4, [sleep.id]: 8, [note.id]: 'n' });
      await repo.saveEntry(e);
      const r = updateTemplate(state, { blocks: [pain, { ...sleep, order: keyBetween(note.order, null) }, note] }, clock);
      expect(r.newVersion).toBe(true);
      await repo.saveTemplate(r.state);
      const view = await repo.getEntryView(e.id);
      expect(view?.fields.map((f) => [f.block.label, f.value])).toEqual([['Schmerz', 4], ['Notiz', 'n'], ['Schlaf', 8]]);
      // neuer Eintrag referenziert Version 2 und ist gültig
      await repo.saveEntry(entry(r.state, { [sleep.id]: 1 }));
    });

    it(`BLK-26 (${codecId}): Detail zeigt Optionslabels der Eintragsversion, auch nach Umbenennen und Entfernen`, async () => {
      const a = { id: newId(), label: 'Übelkeit', color: 'blue' };
      const b = { id: newId(), label: 'Aura', color: 'red' };
      const ms: BlockDef = { id: newId(), type: 'multiselect', label: 'Symptome', required: false, order: keyBetween(null, null), config: { options: [a, b], multiple: true } };
      const state = createTemplate({ id: newId(), diaryId, name: 'M', order: keyBetween(null, null), blocks: [ms] }, clock);
      await repo.saveTemplate(state);
      const e = entry(state, { [ms.id]: [a.id, b.id] });
      await repo.saveEntry(e);
      const v2 = updateTemplate(state, { blocks: [{ ...ms, config: { options: [{ ...a, label: 'Brechreiz' }], multiple: true } }] }, clock, [state.version]).state;
      await repo.saveTemplate(v2);
      const view = await repo.getEntryView(e.id);
      const field = view!.fields[0]!;
      expect(displayValue(field.block, field.value)).toBe('Übelkeit, Aura');
    });

    if (codecId === 'aes') {
      it('DM-09 (aes): Roh-Store enthält keine Klartext-Marker', async () => {
        const { state, pain, note } = template();
        await repo.saveTemplate(state);
        await repo.saveEntry(entry(state, { [pain.id]: 5, [note.id]: 'STB-PLAINTEXT-MARKER-5' }));
        const dump = JSON.stringify(await db.records.toArray());
        expect(dump).not.toContain('STB-PLAINTEXT-MARKER');
        expect(dump).not.toContain('Kopfschmerz');
      });
    }
  });
}

describe('Tagebücher', () => {
  it('legt Tagebuch mit erster Katalogvorlage in einer Transaktion an und listet es', async () => {
    const { createDiary, instantiateCatalogTemplate } = await import('@stb/core');
    const repo = createDiaryRepository(
      createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false }),
    );
    const diary = createDiary({ id: newId(), name: 'Mein Tagebuch', subject: 'human', timezone: 'Europe/Berlin' }, clock);
    const tpl = instantiateCatalogTemplate('migraine', { id: newId(), diaryId: diary.id, order: keyBetween(null, null), newId }, clock);
    await repo.createDiary(diary, tpl);
    expect(await repo.listDiaries()).toEqual([diary]);
    expect(await repo.getDiary(diary.id)).toEqual(diary);
    expect((await repo.listTemplates(diary.id)).map((x) => x.name)).toEqual(['Migräne-Tracking']);

    const foreign = instantiateCatalogTemplate('migraine', { id: newId(), diaryId: newId(), order: keyBetween(null, null), newId }, clock);
    const other = createDiary({ id: newId(), name: 'Zweites', subject: 'animal', timezone: 'UTC' }, clock);
    await expect(repo.createDiary(other, foreign)).rejects.toThrow(RangeError);
    expect(await repo.listDiaries()).toHaveLength(1);
  });
});

describe('Vorlagen verwalten', () => {
  it('Metadaten ändern ohne neue Version; endgültig löschen entfernt Einträge, Versionen und Vorlage', async () => {
    const { createDiary, instantiateCatalogTemplate } = await import('@stb/core');
    const repo = createDiaryRepository(
      createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false }),
    );
    const diary = createDiary({ id: newId(), name: 'T', subject: 'human', timezone: 'UTC' }, clock);
    const tpl = instantiateCatalogTemplate('general-pain', { id: newId(), diaryId: diary.id, order: keyBetween(null, null), newId }, clock);
    await repo.createDiary(diary, tpl);
    const now = iso();
    const pain = tpl.version.blocks[0]!;
    const e: Entry = {
      id: newId(), diaryId: diary.id, templateId: tpl.template.id, templateVersion: 1, occurredAt: now, recordedAt: now, updatedAt: now,
      authorId: 'u', values: { [pain.id]: 3 }, tags: [], meta: { source: 'app', timezone: 'UTC' }, hlc: '0000000000001:0000:dev1',
    };
    await repo.saveEntry(e);

    await repo.saveTemplateMeta({ ...tpl.template, archived: true, order: keyBetween(tpl.template.order, null) });
    const after = await repo.getTemplate(tpl.template.id);
    expect(after?.template.archived).toBe(true);
    expect(after?.version).toEqual(tpl.version);
    await expect(repo.saveTemplateMeta({ ...tpl.template, currentVersion: 2 })).rejects.toThrow(RangeError);

    expect(await repo.countTemplateEntries(tpl.template.id)).toBe(1);
    await repo.deleteTemplate(tpl.template.id, { hlc: '0000000000002:0000:dev1', updatedAt: iso() });
    expect(await repo.getTemplate(tpl.template.id)).toBeUndefined();
    expect(await repo.getTemplateVersion(tpl.template.id, 1)).toBeUndefined();
    expect(await repo.getEntry(e.id)).toBeUndefined();
    expect(await repo.countTemplateEntries(tpl.template.id)).toBe(0);
  });
});

describe('Eigene Body-Map-Bilder', () => {
  it('speichern, auflisten, löschen; ungültige Data-URL wird abgelehnt', async () => {
    const repo = createDiaryRepository(
      createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false }),
    );
    const diaryId = newId();
    const img = { id: newId(), diaryId, name: 'Knie links', dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', width: 600, height: 800, createdAt: iso() };
    await repo.saveBodymapImage(img);
    expect(await repo.listBodymapImages(diaryId)).toEqual([img]);
    await expect(repo.saveBodymapImage({ ...img, id: newId(), dataUrl: 'javascript:alert(1)' })).rejects.toThrow();
    await repo.deleteBodymapImage(img.id);
    expect(await repo.listBodymapImages(diaryId)).toEqual([]);
  });
});

describe('Hinweis-Regeln', () => {
  it('speichern, auflisten, löschen (Tombstone); ungültige Regel wird abgelehnt', async () => {
    const repo = createDiaryRepository(
      createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false }),
    );
    const diaryId = newId();
    const r = { id: newId(), diaryId, blockId: 'b1', op: '>=' as const, value: 7, consecutiveDays: 3, cooldownHours: 24, hlc: '0000000000001:0000:dev1', updatedAt: iso() };
    await repo.saveNotificationRule(r);
    expect(await repo.listNotificationRules(diaryId)).toEqual([r]);
    await expect(repo.saveNotificationRule({ ...r, id: newId(), op: '>' as never })).rejects.toThrow();
    await repo.deleteNotificationRule(r.id, { hlc: '0000000000002:0000:dev1', updatedAt: iso() });
    expect(await repo.listNotificationRules(diaryId)).toEqual([]);
  });
});

describe('Gespeicherte Filter', () => {
  it('speichern, auflisten (nach Name), löschen; ungültige FilterSpec wird abgelehnt', async () => {
    const repo = createDiaryRepository(
      createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock, outbox: false }),
    );
    const diaryId = newId();
    const f = { id: newId(), diaryId, name: 'Schwere Tage', filter: { diaryIds: [diaryId], range: { preset: '30d' as const } }, hlc: '0000000000001:0000:dev1', updatedAt: iso() };
    await repo.saveSavedFilter(f);
    await repo.saveSavedFilter({ ...f, id: newId(), name: 'Arzttermine' });
    expect((await repo.listSavedFilters(diaryId)).map((x) => x.name)).toEqual(['Arzttermine', 'Schwere Tage']);
    await expect(repo.saveSavedFilter({ ...f, id: newId(), filter: { diaryIds: [], range: { preset: '14d' } } as never })).rejects.toThrow();
    await repo.deleteSavedFilter(f.id, { hlc: '0000000000002:0000:dev1', updatedAt: iso() });
    expect((await repo.listSavedFilters(diaryId)).map((x) => x.name)).toEqual(['Arzttermine']);
  });
});

