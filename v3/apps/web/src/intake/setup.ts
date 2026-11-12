// Intake einrichten (Spec 08, Schritt 1): ECDH-P-256-Schlüsselpaar pro Tagebuch. Der private Schlüssel wird als Record
// `kind: 'intakeKey'` gespeichert (lokal per Codec, zum Server nur mit dem DK verschlüsselt über die Sync-Engine).
// Der Server erhält nur den Public Key und den Hash eines zufälligen Tokens (256 Bit). Das Token wird einmal angezeigt.
import { exportPublicKey, generateIdentityEcdhKeyPair, toBase64Url } from '@stb/crypto';
import type { RecordRepository } from '../data/repositories/records.js';

export interface IntakeKeyApi {
  register(diaryId: string, body: { publicKey: string; tokenHash: string }): Promise<{ id: string }>;
}

/** Payload des `intakeKey`-Records. */
export interface IntakeKeyRecord {
  id: string;
  diaryId: string;
  serverKeyId: string;
  /** Wer den Kurzbefehl eingerichtet hat — wird `authorId` der daraus entstehenden Einträge (SHR-10). */
  createdBy: string;
  publicKey: string;
  privateKeyJwk: JsonWebKey;
  createdAt: string;
}

async function sha256b64url(s: string): Promise<string> {
  return toBase64Url(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

export async function setupIntake(deps: {
  api: IntakeKeyApi;
  records: RecordRepository;
  diaryId: string;
  /** Angemeldete Person, die den Kurzbefehl einrichtet. */
  createdBy: string;
  newId: () => string;
  now: () => number;
}): Promise<{ token: string; record: IntakeKeyRecord }> {
  const pair = await generateIdentityEcdhKeyPair();
  const publicKey = await exportPublicKey(pair.publicKey);
  const privateKeyJwk = await globalThis.crypto.subtle.exportKey('jwk', pair.privateKey);
  const token = toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
  const { id: serverKeyId } = await deps.api.register(deps.diaryId, { publicKey, tokenHash: await sha256b64url(token) });
  const record: IntakeKeyRecord = {
    id: deps.newId(), diaryId: deps.diaryId, serverKeyId, createdBy: deps.createdBy, publicKey, privateKeyJwk, createdAt: new Date(deps.now()).toISOString(),
  };
  await deps.records.put({ id: record.id, diaryId: deps.diaryId, kind: 'intakeKey', payload: record });
  return { token, record };
}
