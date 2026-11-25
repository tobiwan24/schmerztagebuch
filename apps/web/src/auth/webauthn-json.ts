// Umwandlung zwischen WebAuthn-JSON (Server, @simplewebauthn) und Browser-API. Optionen werden **vor** dem Klick gebaut,
// damit `credentials.create/get` im Klick-Handler ohne `await` startet (iOS-Nutzergeste, Spec 03).
import { fromBase64Url, toBase64Url } from '@stb/crypto';
import type { CredentialJson } from './account-api.js';
import { PRF_SALT_UMK } from './passkey.js';

type Json = Record<string, unknown>;
const prfExt = { prf: { eval: { first: PRF_SALT_UMK } } } as AuthenticationExtensionsClientInputs;
const descriptors = (list: unknown) =>
  ((list as { id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }[] | undefined) ?? []).map((d) => ({ ...d, id: fromBase64Url(d.id) }));

export function creationOptionsFromServer(o: Json): CredentialCreationOptions {
  const user = o.user as { id: string; name: string; displayName: string };
  return {
    publicKey: {
      ...(o as unknown as PublicKeyCredentialCreationOptions),
      challenge: fromBase64Url(o.challenge as string),
      user: { ...user, id: fromBase64Url(user.id) },
      excludeCredentials: descriptors(o.excludeCredentials),
      extensions: { ...((o.extensions as Json | undefined) ?? {}), ...prfExt },
    },
  };
}

export function requestOptionsFromServer(o: Json): CredentialRequestOptions {
  return {
    publicKey: {
      ...(o as unknown as PublicKeyCredentialRequestOptions),
      challenge: fromBase64Url(o.challenge as string),
      allowCredentials: descriptors(o.allowCredentials),
      extensions: { ...((o.extensions as Json | undefined) ?? {}), ...prfExt },
    },
  };
}

const b64 = (b: ArrayBuffer | null | undefined) => (b ? toBase64Url(new Uint8Array(b)) : undefined);

/** Wie `PublicKeyCredential.toJSON()` (nicht überall verfügbar); PRF-Ergebnisse gehen bewusst **nicht** an den Server. */
export function credentialToJson(cred: Credential): CredentialJson {
  const c = cred as PublicKeyCredential;
  const r = c.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse;
  const response: Record<string, unknown> =
    'attestationObject' in r && r.attestationObject
      ? { clientDataJSON: b64(r.clientDataJSON), attestationObject: b64(r.attestationObject), transports: r.getTransports?.() ?? [] }
      : { clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData), signature: b64(r.signature), userHandle: b64(r.userHandle) };
  return {
    id: c.id, rawId: toBase64Url(new Uint8Array(c.rawId)), type: 'public-key', response,
    authenticatorAttachment: c.authenticatorAttachment ?? undefined, clientExtensionResults: {},
  };
}
