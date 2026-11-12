// Passkey mit PRF-Extension (Spec 03): fester Eval-Salt pro Zweck. Für iOS muss `credentials.get()` **unmittelbar** im
// Klick-Handler laufen (keine `await`s davor), daher werden die Optionen beim Öffnen des Dialogs vorbereitet.
import { fromBase64Url, toBase64Url } from '@stb/crypto';

/** Fester Eval-Salt für den UMK-KEK (Zweck-Domain, 32 Byte). */
export const PRF_SALT_UMK = new Uint8Array(32).map((_, i) => 'stb/v3/prf/umk-wrap/passkey/0001'.charCodeAt(i));

export interface CredentialsLike {
  create(options: CredentialCreationOptions): Promise<Credential | null>;
  get(options: CredentialRequestOptions): Promise<Credential | null>;
}

export class PrfUnsupportedError extends Error {
  constructor() {
    super('prf-unsupported');
    this.name = 'PrfUnsupportedError';
  }
}

type PrfResults = { results?: { first?: ArrayBuffer } };

function prfOutput(cred: Credential | null): Uint8Array<ArrayBuffer> {
  const ext = (cred as PublicKeyCredential | null)?.getClientExtensionResults?.() as { prf?: PrfResults } | undefined;
  const first = ext?.prf?.results?.first;
  if (!first) throw new PrfUnsupportedError();
  return new Uint8Array(first);
}

const randomChallenge = () => globalThis.crypto.getRandomValues(new Uint8Array(32));

/** Neuer, gerätegebundener bzw. synchronisierter Passkey (residentKey, userVerification required). */
export async function createPasskey(
  credentials: CredentialsLike,
  opts: { rpId: string; rpName: string; userName: string; userId: Uint8Array<ArrayBuffer> },
): Promise<{ credentialId: string; prf: Uint8Array<ArrayBuffer> }> {
  const cred = await credentials.create({
    publicKey: {
      rp: { id: opts.rpId, name: opts.rpName },
      user: { id: opts.userId, name: opts.userName, displayName: opts.userName },
      challenge: randomChallenge(),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      extensions: { prf: { eval: { first: PRF_SALT_UMK } } } as AuthenticationExtensionsClientInputs,
    },
  });
  if (!cred) throw new PrfUnsupportedError();
  const credentialId = toBase64Url(new Uint8Array((cred as PublicKeyCredential).rawId));
  try {
    return { credentialId, prf: prfOutput(cred) };
  } catch {
    // Manche Authenticatoren liefern PRF erst bei `get` — dann direkt nachholen.
    const prf = prfOutput(await credentials.get(preparePasskeyRequest({ rpId: opts.rpId, credentialIds: [credentialId] })));
    return { credentialId, prf };
  }
}

/** Optionen vorab bauen (beim Öffnen des Entsperr-Dialogs), damit der Klick ohne `await` `credentials.get` aufruft. */
export function preparePasskeyRequest(opts: { rpId: string; credentialIds: string[] }): CredentialRequestOptions {
  return {
    publicKey: {
      rpId: opts.rpId,
      challenge: randomChallenge(),
      userVerification: 'required',
      allowCredentials: opts.credentialIds.map((id) => ({ type: 'public-key', id: fromBase64Url(id) })),
      extensions: { prf: { eval: { first: PRF_SALT_UMK } } } as AuthenticationExtensionsClientInputs,
    },
  };
}

/**
 * Klick-Handler-Kern: ruft `credentials.get` **synchron** (als erste Anweisung) auf und liefert die PRF-Ausgabe.
 * Kein `await` vor dem Aufruf — sonst verliert iOS die Nutzergeste (`webauthn-not-allowed`).
 */
export function unlockWithPasskey(credentials: CredentialsLike, prepared: CredentialRequestOptions): Promise<Uint8Array<ArrayBuffer>> {
  const pending = credentials.get(prepared);
  return pending.then(prfOutput);
}
