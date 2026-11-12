// Intake abholen (Spec 08, Schritt 4): Siegel holen, mit dem privaten Intake-Schlüssel öffnen, auf einen Eintrag
// abbilden (`meta.source = 'shortcut'`) und erst danach die Abholung bestätigen (Server löscht das Item).
// Schlägt die Validierung fehl, verschwindet nichts: das Item kommt in den **Eingang** (Record `intakeInbox`, VOI-07).
import { importPublicKey, unsealIntake, type IntakeSeal } from '@stb/crypto';
import { mapIntakeToValues, type Entry, type IntakeInput } from '@stb/core';
import { intakeBodySchema } from '@stb/sync-protocol';
import type { RecordRepository } from '../data/repositories/records.js';
import type { DiaryRepository } from '../data/repositories/diary.js';
import type { IntakeKeyRecord } from './setup.js';

export interface IntakeItemsApi {
  list(diaryId: string): Promise<{ id: string; sealed: string; receivedAt: number }[]>;
  ack(itemId: string): Promise<void>;
}

/** Payload eines Eingangs-Items: Rohdaten des Kurzbefehls + Gründe, warum kein Eintrag entstand. */
export interface IntakeInboxItem {
  id: string;
  diaryId: string;
  receivedAt: string;
  body: IntakeInput;
  problems: string[];
}

export interface PickupDeps {
  api: IntakeItemsApi;
  records: RecordRepository;
  diary: DiaryRepository;
  diaryId: string;
  /** Schnelleintrags-Vorlage des Tagebuchs (falls der Kurzbefehl keine `templateId` schickt). */
  defaultTemplateId?: string;
  authorId: string;
  timezone: string;
  newId: () => string;
  now: () => number;
  nextHlc: () => string;
}

export interface PickupResult {
  entries: string[];
  inbox: string[];
  /** Items, die mit keinem lokalen Intake-Schlüssel zu öffnen waren (bleiben auf dem Server). */
  undecryptable: string[];
}

async function keyPairs(records: RecordRepository, diaryId: string): Promise<CryptoKeyPair[]> {
  const out: CryptoKeyPair[] = [];
  for (const r of await records.list(diaryId, 'intakeKey')) {
    const k = r.payload as IntakeKeyRecord;
    const privateKey = await globalThis.crypto.subtle.importKey('jwk', k.privateKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    out.push({ privateKey, publicKey: await importPublicKey(k.publicKey) });
  }
  return out;
}

async function open(seal: IntakeSeal, pairs: CryptoKeyPair[], diaryId: string): Promise<unknown | undefined> {
  for (const pair of pairs) {
    try {
      return JSON.parse(new TextDecoder().decode(await unsealIntake(seal, pair, diaryId))) as unknown;
    } catch {
      // nächster Schlüssel (z. B. nach Token-Neuerzeugung)
    }
  }
  return undefined;
}

export async function pickupIntake(d: PickupDeps): Promise<PickupResult> {
  const result: PickupResult = { entries: [], inbox: [], undecryptable: [] };
  const pairs = await keyPairs(d.records, d.diaryId);
  for (const item of await d.api.list(d.diaryId)) {
    const raw = await open(JSON.parse(item.sealed) as IntakeSeal, pairs, d.diaryId);
    if (raw === undefined) {
      result.undecryptable.push(item.id);
      continue;
    }
    const receivedAt = new Date(item.receivedAt).toISOString();
    const problems: string[] = [];
    const parsed = intakeBodySchema.safeParse(raw);
    const body: IntakeInput = parsed.success ? parsed.data : (raw as IntakeInput);
    if (!parsed.success) problems.push('Unbekanntes Format');

    const templateId = body.templateId ?? d.defaultTemplateId;
    const state = templateId ? await d.diary.getTemplate(templateId) : undefined;
    if (!state) problems.push(templateId ? `Vorlage ${templateId} nicht gefunden` : 'Keine Vorlage für Kurzbefehle festgelegt');

    let saved = false;
    if (state && !problems.length) {
      const mapping = mapIntakeToValues(body, state.version);
      problems.push(...mapping.errors.map((e) => `${e.key}: ${e.message}`));
      if (!problems.length) {
        const now = new Date(d.now()).toISOString();
        const entry: Entry = {
          id: d.newId(), diaryId: d.diaryId, templateId: state.template.id, templateVersion: state.version.version,
          occurredAt: body.occurredAt ?? receivedAt, recordedAt: now, updatedAt: now, authorId: d.authorId,
          values: mapping.values, tags: mapping.tags, meta: { source: 'shortcut', timezone: d.timezone }, hlc: d.nextHlc(),
        };
        try {
          await d.diary.saveEntry(entry);
          result.entries.push(entry.id);
          saved = true;
        } catch (e) {
          problems.push(`Eintrag ungültig: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    if (!saved) {
      const inbox: IntakeInboxItem = { id: d.newId(), diaryId: d.diaryId, receivedAt, body, problems };
      await d.records.put({ id: inbox.id, diaryId: d.diaryId, kind: 'intakeInbox', payload: inbox });
      result.inbox.push(inbox.id);
    }
    // Erst nach lokaler Übernahme (Eintrag oder Eingang) bestätigen — so geht nichts verloren.
    await d.api.ack(item.id);
  }
  return result;
}
