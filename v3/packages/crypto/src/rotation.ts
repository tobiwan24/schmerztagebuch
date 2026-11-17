// DK-Rotation (Spec 03 „Erweiterungen v3.x", M22, A-119). Der Owner-Client erzeugt DK′ (`key_epoch` + 1), verpackt ihn nur für
// die verbleibenden Mitglieder und verschlüsselt alle Records danach im Hintergrund neu.
//
// Sicherheitsregeln (höchstes Datenverlust-Risiko im Plan):
//  - Zustandslos und idempotent: Was noch zu tun ist, ergibt sich allein aus der Epoche im Envelope jedes Records. Ein Abbruch an
//    beliebiger Stelle (auch zwischen Server-Annahme und Antwort) wird durch erneutes Starten fortgesetzt; bereits umgestellte
//    Records werden übersprungen.
//  - Nichts wird überschrieben, was nicht nachweislich lesbar ist: Der neue Chiffretext wird vor dem Senden entschlüsselt und
//    mit dem Klartext verglichen; unbekannte Epoche oder Entschlüsselungsfehler lassen den Record unangetastet (`failed`).
//  - Zwei Epochen sind während der Rotation lesbar: der alte DK steht, unter dem neuen DK verpackt (`prevDkWrap`), für jedes
//    Mitglied bereit; Records tragen ihre Epoche im Envelope.
import { CryptoError } from './errors.js';
import { decryptRecord, encryptRecord, generateDiaryKey, parseEnvelope } from './envelope.js';
import { wrapDkForMember, type MemberDkWrap } from './share.js';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const PREV_KIND = 'dkPrev';

export interface RotationMember {
  principalId: string;
  /** Identity-ECDH-Schlüssel des verbleibenden Mitglieds (auch der Owner selbst gehört dazu). */
  publicKey: CryptoKey;
}

export interface DkRotationPlan {
  diaryId: string;
  fromEpoch: number;
  toEpoch: number;
  newDk: CryptoKey;
  /** Ein Wrap je verbleibendem Mitglied, gebunden an `toEpoch`. Entfernte Mitglieder bekommen keinen. */
  wraps: { principalId: string; wrap: MemberDkWrap }[];
  /** Alter DK, unter dem neuen DK verpackt (base64url-Envelope): macht Records der alten Epoche für alle Mitglieder lesbar. */
  prevDkWrap: string;
}

/** Plant die Rotation: neuer DK, Wraps nur für die aktiven Mitglieder, alter DK unter dem neuen. Verändert nichts außerhalb. */
export async function planDkRotation(input: { diaryId: string; fromEpoch: number; oldDk: CryptoKey; members: readonly RotationMember[] }): Promise<DkRotationPlan> {
  const { diaryId, fromEpoch, oldDk, members } = input;
  if (!Number.isInteger(fromEpoch) || fromEpoch < 1 || fromEpoch >= 0xffffffff) throw new CryptoError('invalid-rotation', `Ungültige Epoche ${fromEpoch}`);
  if (members.length === 0) throw new CryptoError('invalid-rotation', 'Eine Rotation braucht mindestens ein verbleibendes Mitglied');
  if (new Set(members.map((m) => m.principalId)).size !== members.length) throw new CryptoError('invalid-rotation', 'Mitglied doppelt angegeben');
  const toEpoch = fromEpoch + 1;
  const newDk = await generateDiaryKey();
  const wraps = await Promise.all(members.map(async (m) => ({ principalId: m.principalId, wrap: await wrapDkForMember(newDk, m.publicKey, { diaryId, keyEpoch: toEpoch }) })));
  const oldRaw = new Uint8Array(await subtle().exportKey('raw', oldDk));
  const prevDkWrap = await encryptRecord(newDk, { diaryId, kind: PREV_KIND, recordId: String(fromEpoch), keyEpoch: toEpoch }, oldRaw);
  return { diaryId, fromEpoch, toEpoch, newDk, wraps, prevDkWrap };
}

/** Öffnet den alten DK aus `prevDkWrap` mit dem neuen DK (jedes Mitglied, das den neuen DK hat, kann Records der alten Epoche lesen). */
export async function openPreviousDk(newDk: CryptoKey, ctx: { diaryId: string; fromEpoch: number; toEpoch: number }, prevDkWrap: string): Promise<CryptoKey> {
  const raw = await decryptRecord(newDk, { diaryId: ctx.diaryId, kind: PREV_KIND, recordId: String(ctx.fromEpoch), keyEpoch: ctx.toEpoch }, prevDkWrap);
  return subtle().importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// ---------------------------------------------------------------------------------------------------------------------------
// Re-Verschlüsselung

export interface RotationRecord {
  recordId: string;
  kind: string;
  rev: number;
  deleted: boolean;
  ciphertext: string;
}

export interface ReencryptOp {
  recordId: string;
  kind: string;
  baseRev: number;
  deleted: boolean;
  ciphertext: string;
}

export type ReencryptResult =
  | { recordId: string; status: 'applied' }
  | { recordId: string; status: 'conflict'; server: { rev: number; ciphertext: string | null; deleted: boolean } };

export interface ReencryptTransport {
  pull(since: number): Promise<{ records: RotationRecord[]; nextSince: number; hasMore: boolean }>;
  push(ops: ReencryptOp[]): Promise<ReencryptResult[]>;
}

export interface EpochKeys {
  diaryId: string;
  from: { epoch: number; key: CryptoKey };
  to: { epoch: number; key: CryptoKey };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Stellt einen Record auf die neue Epoche um. `null` = nichts zu tun (schon neue Epoche). Unbekannte Epoche oder
 * Entschlüsselungsfehler werfen — der Record bleibt dann unverändert (kein Datenverlust durch Überschreiben).
 */
export async function reencryptRecord(rec: RotationRecord, keys: EpochKeys): Promise<ReencryptOp | null> {
  const epoch = parseEnvelope(rec.ciphertext).keyEpoch;
  if (epoch === keys.to.epoch) return null;
  if (epoch !== keys.from.epoch) throw new CryptoError('decrypt-failed', `Record ${rec.recordId}: unbekannte Epoche ${epoch}`);
  const aad = { diaryId: keys.diaryId, kind: rec.kind, recordId: rec.recordId };
  const plain = await decryptRecord(keys.from.key, { ...aad, keyEpoch: epoch }, rec.ciphertext);
  const ciphertext = await encryptRecord(keys.to.key, { ...aad, keyEpoch: keys.to.epoch }, plain);
  // Gegenprobe: nur senden, was sich mit dem neuen Schlüssel wieder zum selben Klartext öffnen lässt
  const check = await decryptRecord(keys.to.key, { ...aad, keyEpoch: keys.to.epoch }, ciphertext);
  if (!sameBytes(plain, check)) throw new CryptoError('decrypt-failed', `Record ${rec.recordId}: Gegenprobe fehlgeschlagen`);
  return { recordId: rec.recordId, kind: rec.kind, baseRev: rec.rev, deleted: rec.deleted, ciphertext };
}

export interface ReencryptSummary {
  /** Auf die neue Epoche umgestellt (vom Server bestätigt). */
  reencrypted: number;
  /** Bereits in der neuen Epoche vorgefunden (Fortsetzung oder Änderung eines anderen Mitglieds). */
  alreadyCurrent: number;
  /** Records, die nicht umgestellt werden konnten (bleiben unverändert und lesbar in ihrer alten Epoche). */
  failed: { recordId: string; reason: string }[];
  passes: number;
  /** Nichts mehr offen: kein Konflikt im letzten Durchgang, nichts fehlgeschlagen. Erst dann darf die Rotation abgeschlossen werden. */
  done: boolean;
}

/**
 * Stellt alle Records des Tagebuchs auf die neue Epoche um. Zustandslos: beliebig oft und nach jedem Abbruch erneut aufrufbar
 * (Fehler des Transports werden nicht verschluckt, sondern an den Aufrufer gereicht). Konflikte (ein Mitglied hat den Record
 * inzwischen geändert) werden im nächsten Durchgang erneut aus dem Serverstand bearbeitet.
 */
export async function runReencrypt(input: {
  keys: EpochKeys;
  transport: ReencryptTransport;
  batchSize?: number;
  maxPasses?: number;
  signal?: AbortSignal;
  onProgress?: (p: { reencrypted: number; alreadyCurrent: number }) => void;
}): Promise<ReencryptSummary> {
  const { keys, transport, batchSize = 50, maxPasses = 5, signal, onProgress } = input;
  if (keys.to.epoch !== keys.from.epoch + 1) throw new CryptoError('invalid-rotation', 'Neue Epoche muss genau eine größer sein');
  const failed = new Map<string, string>();
  // je Record höchstens einmal gezählt (derselbe Record taucht in späteren Seiten/Durchgängen erneut auf)
  const pushed = new Set<string>();
  const current = new Set<string>();
  const counts = () => ({ reencrypted: pushed.size, alreadyCurrent: [...current].filter((id) => !pushed.has(id)).length });
  let passes = 0;
  let conflicts = 0;
  const abortCheck = () => {
    if (signal?.aborted) throw new CryptoError('invalid-rotation', 'Abgebrochen');
  };

  do {
    passes++;
    conflicts = 0;
    let since = 0;
    for (;;) {
      abortCheck();
      const page = await transport.pull(since);
      const ops: ReencryptOp[] = [];
      for (const rec of page.records) {
        if (failed.has(rec.recordId)) continue;
        try {
          const op = await reencryptRecord(rec, keys);
          if (op) ops.push(op);
          else current.add(rec.recordId);
        } catch (e) {
          failed.set(rec.recordId, e instanceof Error ? e.message : 'unbekannt');
        }
      }
      for (let i = 0; i < ops.length; i += batchSize) {
        abortCheck();
        const results = await transport.push(ops.slice(i, i + batchSize));
        for (const r of results) {
          if (r.status === 'applied') pushed.add(r.recordId);
          else if (r.server.ciphertext !== null && parseEnvelope(r.server.ciphertext).keyEpoch === keys.to.epoch) current.add(r.recordId);
          else conflicts++;
        }
        onProgress?.(counts());
      }
      if (!page.hasMore) break;
      since = page.nextSince;
    }
  } while (conflicts > 0 && passes < maxPasses);

  return {
    ...counts(),
    failed: [...failed].map(([recordId, reason]) => ({ recordId, reason })),
    passes,
    done: conflicts === 0 && failed.size === 0,
  };
}
