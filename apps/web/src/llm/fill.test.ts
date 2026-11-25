import { describe, it, expect } from 'vitest';
import { createIdGenerator, instantiateCatalogTemplate, type BlockDef } from '@stb/core';
import { applyFill } from './fill';
import { LlmClientError, llmErrorFromResponse, requestFill } from './client';

const clock = { now: () => 1_700_000_000_000 };
const { newId } = createIdGenerator(clock);
const state = instantiateCatalogTemplate('migraine', { id: newId(), diaryId: newId(), order: 'V', newId }, clock);
const version = state.version;
const block = (label: string) => version.blocks.find((b) => b.label === label) as BlockDef;
const pain = block('Schmerzstärke');
const symptoms = block('Begleitsymptome');
const duration = block('Dauer (Stunden)');
const note = version.blocks.find((b) => b.type === 'textarea');

describe('Entwurf aus Freitext', () => {
  it('VOI-14: gültige Werte füllen den Entwurf und werden als geändert markiert; bestehende Felder bleiben', () => {
    const current = { [duration.id]: 3 };
    const d = applyFill(version, current, { values: { [pain.id]: 6, [symptoms.id]: ['übelkeit'] } });
    expect(d.values[pain.id]).toBe(6);
    expect(d.values[duration.id]).toBe(3);
    expect((d.values[symptoms.id] as string[]).length).toBe(1);
    expect(d.changed).toEqual([pain.id, symptoms.id]);
    expect(d.rejected).toEqual([]);
  });

  it('VOI-14: ungültige Werte werden verworfen und gemeldet', () => {
    const d = applyFill(version, {}, { values: { [pain.id]: 999, [symptoms.id]: ['Quatsch'] } });
    expect(d.values[pain.id]).toBeUndefined();
    expect(d.changed).toEqual([]);
    expect(d.rejected.map((r) => r.label)).toEqual([pain.label, symptoms.label]);
    expect(d.rejected.every((r) => (r.message ?? '').length > 0)).toBe(true);
  });

  it('VOI-14: erfundene Block-IDs werden verworfen (ohne Label) und landen nicht im Notiztext', () => {
    const d = applyFill(version, {}, { values: { 'gibt-es-nicht': 'x', [pain.id]: 4 } });
    expect(d.rejected).toEqual([{}]);
    expect(d.changed).toEqual([pain.id]);
    expect(JSON.stringify(d.values)).not.toContain('gibt-es-nicht');
  });

  it('VOI-14: Text ohne Feldzuordnung kommt ans Notizfeld; vorhandener Text des Nutzers bleibt erhalten', () => {
    expect(note).toBeDefined();
    const d = applyFill(version, { [note!.id]: { text: 'schon da' } }, { text: 'Dazu noch Lärmempfindlichkeit', values: {} });
    expect(d.values[note!.id]).toEqual({ text: 'schon da\nDazu noch Lärmempfindlichkeit' });
    expect(d.changed).toEqual([note!.id]);
  });

  it('VOI-14: ohne Textfeld in der Vorlage wird der Text als nicht zugeordnet gemeldet', () => {
    const noNote = { ...version, blocks: version.blocks.filter((b) => b.type !== 'textarea') };
    const d = applyFill(noNote, {}, { text: 'Lärm', values: {} });
    expect(d.unassigned).toBe('Lärm');
    expect(d.changed).toEqual([]);
  });

  it('VOI-14: gleiche Werte gelten nicht als Änderung; ein genannter Zeitpunkt wird übernommen, ein ungültiger ignoriert', () => {
    const same = applyFill(version, { [pain.id]: 6 }, { values: { [pain.id]: 6 }, occurredAt: '2026-11-15T08:30:00Z' });
    expect(same.changed).toEqual([]);
    expect(same.time).toMatchObject({ mode: 'point' });
    expect(applyFill(version, {}, { values: {}, occurredAt: 'gestern' }).time).toBeUndefined();
  });
});

describe('KI-Anfrage', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const req = { templateName: 'Migräne', version, text: 'Kopfschmerz 6', now: '2026-11-16T10:00:00Z' };

  it('VOI-14: sendet Text und Vorlage per POST mit Cookie ohne Cache und prüft die Antwort', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const r = await requestFill(req, (url, init) => {
      seen = { url: String(url), init: init! };
      return Promise.resolve(json({ values: { [pain.id]: 6 } }));
    });
    expect(r).toEqual({ values: { [pain.id]: 6 } });
    expect(seen?.url).toBe('/api/v1/llm/fill');
    expect(seen?.init).toMatchObject({ method: 'POST', credentials: 'include', cache: 'no-store' });
    expect(JSON.parse(String(seen?.init.body))).toMatchObject({ text: 'Kopfschmerz 6', templateName: 'Migräne' });
    await expect(requestFill(req, () => Promise.resolve(json({ values: 'kaputt' })))).rejects.toMatchObject({ code: 'invalid-output' });
  });

  it('VOI-14: Serverfehler werden auf verständliche Codes abgebildet, ohne Inhalte weiterzugeben', async () => {
    const codes: [number, unknown, string][] = [
      [401, {}, 'unauthenticated'], [404, { error: 'llm_disabled' }, 'disabled'], [413, {}, 'too-large'],
      [429, { error: 'rate-limited' }, 'rate-limited'], [429, { error: 'llm_budget_exhausted' }, 'budget'], [422, { error: 'llm_refused' }, 'refused'],
      [503, { error: 'llm_unavailable' }, 'unavailable'], [502, { error: 'llm_invalid_output' }, 'invalid-output'], [502, { error: 'llm_failed' }, 'failed'], [400, null, 'failed'],
    ];
    for (const [status, body, code] of codes) expect(llmErrorFromResponse(status, body).code).toBe(code);
    await expect(requestFill(req, () => Promise.resolve(json({ error: 'llm_budget_exhausted' }, 429)))).rejects.toMatchObject({ code: 'budget' });
    await expect(requestFill(req, () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toBeInstanceOf(LlmClientError);
    await expect(requestFill(req, () => Promise.reject(new TypeError('Failed to fetch')))).rejects.toMatchObject({ code: 'offline' });
  });
});
