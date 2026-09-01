// src/utils/webauthnPrf.ts
// WebAuthn-Ceremonies (Registrierung + Login) mit PRF-Extension, via @simplewebauthn/browser.
//
// Die PRF-Extension ist Stand @simplewebauthn/browser 13.x noch nicht in den mitgelieferten
// DOM-Typen enthalten (WebAuthn-Level-3-Feature) — daher eigene, minimale Erweiterungstypen
// statt eines any-Durchgriffs.

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticationExtensionsClientInputs,
  AuthenticationExtensionsClientOutputs,
} from '@simplewebauthn/browser';

interface PrfExtensionEval {
  first: BufferSource;
  second?: BufferSource;
}

interface PrfExtensionInput {
  eval?: PrfExtensionEval;
}

interface PrfExtensionOutput {
  enabled?: boolean;
  results?: { first?: ArrayBuffer; second?: ArrayBuffer };
}

type ExtensionsInputWithPrf = AuthenticationExtensionsClientInputs & { prf?: PrfExtensionInput };
type ExtensionOutputsWithPrf = AuthenticationExtensionsClientOutputs & { prf?: PrfExtensionOutput };

/**
 * Fixer, NICHT geheimer PRF-Eval-Salt (applikationsweit konstant). Die eigentliche
 * kryptographische Domain-Trennung übernimmt die HKDF-info in keyManagement.ts —
 * dieser Salt dient nur dazu, dass der Authenticator bei Registrierung und Login
 * denselben PRF-Output für dieselbe Credential liefert.
 */
const PRF_EVAL_SALT: ArrayBuffer = new TextEncoder().encode('schmerztagebuch-prf-eval-salt-v1').buffer.slice(0, 32);

export function isWebAuthnPlatformSupported(): boolean {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnPlatformSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function withPrfExtension<T extends { extensions?: AuthenticationExtensionsClientInputs }>(optionsJSON: T): T {
  const extensions: ExtensionsInputWithPrf = {
    ...optionsJSON.extensions,
    prf: { eval: { first: PRF_EVAL_SALT } },
  };
  return { ...optionsJSON, extensions };
}

function extractPrfOutput(clientExtensionResults: AuthenticationExtensionsClientOutputs): ArrayBuffer | null {
  const ext = clientExtensionResults as ExtensionOutputsWithPrf;
  return ext.prf?.results?.first ?? null;
}

export interface RegisterPasskeyResult {
  response: RegistrationResponseJSON;
  prfOutput: ArrayBuffer | null;
}

/**
 * Startet die WebAuthn-Registrierungs-Ceremony (navigator.credentials.create) mit
 * angeforderter PRF-Extension. `optionsJSON` kommt 1:1 vom Server (`register-options`).
 */
export async function registerPasskeyWithPrf(
  optionsJSON: PublicKeyCredentialCreationOptionsJSON
): Promise<RegisterPasskeyResult> {
  const response = await startRegistration({ optionsJSON: withPrfExtension(optionsJSON) });
  return { response, prfOutput: extractPrfOutput(response.clientExtensionResults) };
}

export interface AuthenticatePasskeyResult {
  response: AuthenticationResponseJSON;
  prfOutput: ArrayBuffer | null;
}

/**
 * Startet die WebAuthn-Login-Ceremony (navigator.credentials.get) mit angeforderter
 * PRF-Extension. `optionsJSON` kommt 1:1 vom Server (`login-options`).
 *
 * Hinweis: Laut Spec (Stand iOS 26.6, Plattform-Authenticator) liefert bereits die
 * Registrierungs-Ceremony (registerPasskeyWithPrf) einen stabilen PRF-Output. Manche
 * Browser/CTAP2-Kombinationen liefern bei create() aber nur `prf.enabled: true` ohne
 * `results` und erst bei der ersten nachfolgenden get()-Ceremony den tatsächlichen
 * Output — dieser Fall ist für Plattform-Passkeys (Face ID/iCloud-Schlüsselbund)
 * laut Recherche in der Spec nicht relevant, wird hier aber als Baustein bereitgestellt,
 * falls ein zukünftiger zweistufiger Registrierungs-Flow nötig wird.
 */
export async function authenticatePasskeyWithPrf(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON
): Promise<AuthenticatePasskeyResult> {
  const response = await startAuthentication({ optionsJSON: withPrfExtension(optionsJSON) });
  return { response, prfOutput: extractPrfOutput(response.clientExtensionResults) };
}
