// DK-Verpackung für Mitglieder per ECDH P-256, ephemer-statisch (Spec 03, Spec 09):
//   shared = ECDH(ephemeral.private, recipient.public)
//   KEK    = HKDF-SHA-256(ikm=shared, salt=epk||recipientPub, info="stb/v3/dk-wrap/ecdh|<diaryId>|<keyEpoch>")
//   wrap   = AES-KW(KEK, DK)
// Die `info` bindet den Wrap an Tagebuch und keyEpoch; die Salt bindet ihn an beide öffentlichen Schlüssel.
import { CryptoError } from './errors.js';
import { DOMAINS } from './domains.js';
import { fromBase64Url, toBase64Url, utf8 } from './encoding.js';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export interface DkWrapContext {
  diaryId: string;
  keyEpoch: number;
}

/** DK-Wrap für ein Mitglied (`memberships.wrapped_dk`). */
export interface MemberDkWrap {
  v: 1;
  /** Ephemerer öffentlicher Schlüssel (raw, unkomprimiert, base64url). */
  epk: string;
  wrapped: string;
}

/** Identity-ECDH-Schlüsselpaar. Der private Schlüssel ist extrahierbar, damit er mit der UMK verschlüsselt werden kann. */
export function generateIdentityEcdhKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(ECDH, true, ['deriveBits']);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle().exportKey('raw', key)));
}

export function importPublicKey(encoded: string): Promise<CryptoKey> {
  return subtle().importKey('raw', fromBase64Url(encoded), ECDH, true, []);
}

async function deriveWrapKek(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  epkRaw: Uint8Array<ArrayBuffer>,
  recipientRaw: Uint8Array<ArrayBuffer>,
  ctx: DkWrapContext,
): Promise<CryptoKey> {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const salt = new Uint8Array(epkRaw.length + recipientRaw.length);
  salt.set(epkRaw);
  salt.set(recipientRaw, epkRaw.length);
  const base = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const info = utf8(`${DOMAINS.dkWrapEcdh}|${ctx.diaryId}|${ctx.keyEpoch}`);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info }, base, { name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

export async function wrapDkForMember(dk: CryptoKey, recipientPublicKey: CryptoKey, ctx: DkWrapContext): Promise<MemberDkWrap> {
  const eph = await subtle().generateKey(ECDH, true, ['deriveBits']);
  const epkRaw = new Uint8Array(await subtle().exportKey('raw', eph.publicKey));
  const recipientRaw = new Uint8Array(await subtle().exportKey('raw', recipientPublicKey));
  const kek = await deriveWrapKek(eph.privateKey, recipientPublicKey, epkRaw, recipientRaw, ctx);
  const wrapped = new Uint8Array(await subtle().wrapKey('raw', dk, kek, 'AES-KW'));
  return { v: 1, epk: toBase64Url(epkRaw), wrapped: toBase64Url(wrapped) };
}

/** Entpackt den DK mit dem eigenen Identity-Schlüsselpaar. Fremder Schlüssel, falscher Kontext, Beschädigung → `unwrap-failed`. */
export async function unwrapDkForMember(wrap: MemberDkWrap, recipient: CryptoKeyPair, ctx: DkWrapContext): Promise<CryptoKey> {
  try {
    if (wrap.v !== 1) throw new Error('Version');
    const epkRaw = fromBase64Url(wrap.epk);
    const epk = await subtle().importKey('raw', epkRaw, ECDH, false, []);
    const recipientRaw = new Uint8Array(await subtle().exportKey('raw', recipient.publicKey));
    const kek = await deriveWrapKek(recipient.privateKey, epk, epkRaw, recipientRaw, ctx);
    return await subtle().unwrapKey('raw', fromBase64Url(wrap.wrapped), kek, 'AES-KW', { name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
  } catch {
    throw new CryptoError('unwrap-failed', 'Tagebuch-Schlüssel konnte nicht entpackt werden');
  }
}
