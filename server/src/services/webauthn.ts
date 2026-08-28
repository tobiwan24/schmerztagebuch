import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationExtensionsClientInputs,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import { config } from '../config.js';
import { setChallenge, takeChallenge } from '../utils/challengeStore.js';
import { findCredentialsByUserId } from './credentials.js';
import { findUserByUsername } from './users.js';
import type { CredentialRow } from '../types.js';

/**
 * `@simplewebauthn/server`s Extensions-Typen kennen die PRF-Extension noch
 * nicht (Stand der installierten Version, siehe server/package.json). Der
 * Server verifiziert die PRF-Extension inhaltlich nicht selbst — er fordert
 * sie laut Spec nur in den Ceremony-Optionen an und reicht sie durch. Ein
 * gezielter Type-Cast an dieser einen Stelle ist dafür ausreichend und
 * genauer als die Extensions komplett `any` zu typisieren.
 */
const PRF_EXTENSION = { prf: {} } as unknown as AuthenticationExtensionsClientInputs;

export async function buildRegistrationOptions(
  username: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userName: username,
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
    extensions: PRF_EXTENSION,
  });
  setChallenge('register', username, options.challenge);
  return options;
}

export async function verifyRegistration(
  username: string,
  response: RegistrationResponseJSON,
): Promise<VerifiedRegistrationResponse> {
  const expectedChallenge = takeChallenge('register', username);
  if (!expectedChallenge) {
    throw new Error('Keine offene Registrierungs-Challenge für diesen User (abgelaufen oder unbekannt).');
  }
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.allowedOrigins,
    expectedRPID: config.rpId,
  });
}

export async function buildAuthenticationOptions(
  username: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  let allowCredentials: { id: string }[] | undefined;
  const user = findUserByUsername(username);
  if (user) {
    allowCredentials = findCredentialsByUserId(user.id).map((c) => ({ id: c.credential_id }));
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: 'required',
    allowCredentials,
    extensions: PRF_EXTENSION,
  });
  setChallenge('login', username, options.challenge);
  return options;
}

export async function verifyAuthentication(
  username: string,
  response: AuthenticationResponseJSON,
  credential: CredentialRow,
): Promise<VerifiedAuthenticationResponse> {
  const expectedChallenge = takeChallenge('login', username);
  if (!expectedChallenge) {
    throw new Error('Keine offene Login-Challenge für diesen User (abgelaufen oder unbekannt).');
  }
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.allowedOrigins,
    expectedRPID: config.rpId,
    credential: {
      id: credential.credential_id,
      publicKey: new Uint8Array(credential.public_key),
      counter: credential.sign_count,
    },
  });
}
