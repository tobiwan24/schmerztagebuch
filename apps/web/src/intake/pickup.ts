// Intake abholen (Spec 08, Schritt 4): Siegel holen, mit dem privaten Intake-Schlüssel öffnen, auf einen Eintrag
// abbilden (`meta.source = 'shortcut'`) und erst danach die Abholung bestätigen (Server löscht das Item).
// Schlägt die Validierung fehl, verschwindet nichts: das Item kommt in den **Eingang** (Record `intakeInbox`, VOI-07).
import { importPublicKey, unsealIntake, type IntakeSeal } from '@stb/crypto';
import { mapIntakeToValues, uuidV7FromSeed, type Entry, type IntakeInput } from '@stb/core';
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
  /** Rückfall-Autor, falls der Intake-Schlüssel keinen Ersteller kennt (ältere Records). */
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

interface IntakeKeyPair {
  pair: CryptoKeyPair;
  createdBy?: string;
}

async function keyPairs(records: RecordRepository, diaryId: string): Promise<IntakeKeyPair[]> {
  const out: IntakeKeyPair[] = [];
  for (const r of await records.list(diaryId, 'intakeKey')) {
    const k = r.payload as IntakeKeyRecord;
    const privateKey = await globalThis.crypto.subtle.importKey('jwk', k.privateKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    out.push({ pair: { privateKey, publicKey: await importPublicKey(k.publicKey) }, ...(k.createdBy ? { createdBy: k.createdBy } : {}) });
  }
  return out;
}

async function open(seal: IntakeSeal, keys: IntakeKeyPair[], diaryId: string): Promise<{ raw: unknown; createdBy?: string } | undefined> {
  for (const k of keys) {
    try {
      const raw = JSON.parse(new TextDecoder().decode(await unsealIntake(seal, k.pair, diaryId))) as unknown;
      return k.createdBy ? { raw, createdBy: k.createdBy } : { raw };
    } catch {
      // nächster Schlüssel (z. B. nach Token-Neuerzeugung)
    }
  }
  return undefined;
}

/** Deterministische Record-ID aus der Server-Item-ID: Doppelabholungen landen auf demselben Record (Review Befund 7). */
async function idFor(purpose: 'entry' | 'inbox', itemId: string, receivedAtMs: number): Promise<string> {
  const seed = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`stb/v3/intake/${purpose}|${itemId}`)));
  return uuidV7FromSeed(receivedAtMs, seed);
}

export async function pickupIntake(d: PickupDeps): Promise<PickupResult> {
  const result: PickupResult = { entries: [], inbox: [], undecryptable: [] };
  const pairs = await keyPairs(d.records, d.diaryId);
  for (const item of await d.api.list(d.diaryId)) {
    const opened = await open(JSON.parse(item.sealed) as IntakeSeal, pairs, d.diaryId);
    if (opened === undefined) {
      result.undecryptable.push(item.id);
      continue;
    }
    const { raw } = opened;
    const entryId = await idFor('entry', item.id, item.receivedAt);
    const inboxId = await idFor('inbox', item.id, item.receivedAt);
    if ((await d.records.get(entryId)) || (await d.records.get(inboxId))) {
      // Schon übernommen (z. B. ack beim letzten Mal am Netz gescheitert oder anderes Gerät): nur noch bestätigen.
      await d.api.ack(item.id);
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
      // Harte Fehler nur aus `values`; unpassende Zeilen (FEAT-024) werden ignoriert und bleiben in `meta.dictation.lines`.
      problems.push(...mapping.errors.map((e) => `${e.key}: ${e.message}`));
      // Vorlage ohne Notizfeld: Text/Restwerte hätten keinen Platz im Eintrag → Eingang statt Verlust (Review Befund 3, A-020).
      if (mapping.note) problems.push(`Text ohne Notizfeld in der Vorlage: ${mapping.note}`);
      if (!problems.length) {
        const now = new Date(d.now()).toISOString();
        const entry: Entry = {
          id: entryId, diaryId: d.diaryId, templateId: state.template.id, templateVersion: state.version.version,
          occurredAt: body.occurredAt ?? receivedAt, recordedAt: now, updatedAt: now, authorId: opened.createdBy ?? d.authorId,
          values: mapping.values, tags: mapping.tags,
          meta: { source: 'shortcut', timezone: d.timezone, ...(mapping.dictation ? { dictation: mapping.dictation } : {}) }, hlc: d.nextHlc(),
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
      const inbox: IntakeInboxItem = { id: inboxId, diaryId: d.diaryId, receivedAt, body, problems };
      await d.records.put({ id: inbox.id, diaryId: d.diaryId, kind: 'intakeInbox', payload: inbox });
      result.inbox.push(inbox.id);
    }
    // Erst nach lokaler Übernahme (Eintrag oder Eingang) bestätigen — so geht nichts verloren.
    await d.api.ack(item.id);
  }
  return result;
}
