// NUR für Tests: Software-Authenticator, der echte WebAuthn-Antworten erzeugt (Attestation „none", ES256, UV gesetzt).
// So laufen Registrierung/Login durch die echte Verifikation von @simplewebauthn/server — ohne Browser.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoCBOR, isoBase64URL } from '@simplewebauthn/server/helpers';

const b64u = (b: Uint8Array) => isoBase64URL.fromBuffer(new Uint8Array(b));
const sha256 = (b: Uint8Array | string) => new Uint8Array(createHash('sha256').update(b).digest());
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

export interface SoftAuthenticator {
  credentialId: string;
  userHandle?: string;
  register(opts: { challenge: string; rpId: string; origin: string; userHandle: string }): unknown;
  authenticate(opts: { challenge: string; rpId: string; origin: string; userVerified?: boolean }): unknown;
}

export function createSoftAuthenticator(): SoftAuthenticator {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const rawId = new Uint8Array(randomBytes(16));
  let counter = 0;
  let userHandle: string | undefined;

  const coseKey = (pub: KeyObject) => {
    const jwk = pub.export({ format: 'jwk' });
    return new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, isoBase64URL.toBuffer(jwk.x!)],
      [-3, isoBase64URL.toBuffer(jwk.y!)],
    ]);
  };
  const clientData = (type: string, challenge: string, origin: string) =>
    new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    get credentialId() {
      return b64u(rawId);
    },
    get userHandle() {
      return userHandle;
    },
    register({ challenge, rpId, origin, userHandle: handle }) {
      userHandle = handle;
      const attested = concat(new Uint8Array(16), new Uint8Array([rawId.length >> 8, rawId.length & 255]), rawId, isoCBOR.encode(coseKey(publicKey)));
      const authData = concat(sha256(rpId), new Uint8Array([FLAG_UP | FLAG_UV | FLAG_AT]), u32(counter), attested);
      const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]) as never);
      return {
        id: b64u(rawId), rawId: b64u(rawId), type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
        response: { clientDataJSON: b64u(clientData('webauthn.create', challenge, origin)), attestationObject: b64u(attestationObject), transports: ['internal'] },
      };
    },
    authenticate({ challenge, rpId, origin, userVerified = true }) {
      counter += 1;
      const authData = concat(sha256(rpId), new Uint8Array([FLAG_UP | (userVerified ? FLAG_UV : 0)]), u32(counter));
      const cd = clientData('webauthn.get', challenge, origin);
      const signature = new Uint8Array(sign('sha256', concat(authData, sha256(cd)), privateKey));
      return {
        id: b64u(rawId), rawId: b64u(rawId), type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
        response: { clientDataJSON: b64u(cd), authenticatorData: b64u(authData), signature: b64u(signature), ...(userHandle ? { userHandle } : {}) },
      };
    },
  };
}
