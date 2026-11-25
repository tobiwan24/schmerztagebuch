export { CryptoError, type CryptoErrorCode } from './errors.js';
export { toBase64Url, fromBase64Url } from './encoding.js';
export { DOMAINS } from './domains.js';
export { deriveLocalDiaryKey, deriveSearchIndexKey, LOCAL_DK_EPOCH } from './local-dk.js';
export {
  ENVELOPE_VERSION,
  buildAad,
  generateDiaryKey,
  parseEnvelope,
  encryptRecord,
  decryptRecord,
  type RecordAad,
  type Envelope,
} from './envelope.js';
export { generateUmk, wrapUmk, unwrapUmk, deriveKek, PBKDF2_ITERATIONS, KDF_SALT_BYTES, type UmkFactor, type UmkWrap } from './umk.js';
export { normalizeBackupCode, generateBackupCode, parseBackupCode, deriveBackupAuth, BACKUP_CODE_ENTROPY_BITS } from './backup-code.js';
export { generateIdentityEcdhKeyPair, exportPublicKey, importPublicKey, wrapDkForMember, unwrapDkForMember, type MemberDkWrap, type DkWrapContext } from './share.js';
export { sealBackupFile, openBackupFile, readBackupHeader, BACKUP_FILE_FORMAT, BACKUP_FILE_VERSION, type BackupSecret, type BackupFileHeader } from './backup-file.js';
export { sealIdentityKey, openIdentityKey, type SealedIdentity } from './identity.js';
export { sealForIntake, unsealIntake, sealManifest, openManifest, type IntakeSeal, type ManifestSeal } from './intake.js';
export { createInvitationSecret, encryptInvitation, decryptInvitation, invitationMac, verifyInvitationMac, safetyNumber, updateVerification, type InvitationDetails, type VerificationState } from './invitation.js';
export { generateShareId, generateShareKey, encryptReport, decryptReport, buildReportLink, parseReportKey } from './report-share.js';
export {
  planDkRotation,
  openPreviousDk,
  reencryptRecord,
  runReencrypt,
  reencryptBlobs,
  type BlobTransport,
  type BlobReencryptSummary,
  type RotationMember,
  type DkRotationPlan,
  type RotationRecord,
  type ReencryptOp,
  type ReencryptResult,
  type ReencryptTransport,
  type EpochKeys,
  type ReencryptSummary,
} from './rotation.js';
export {
  generateIntegrationToken,
  hashIntegrationToken,
  encodeAccessString,
  parseAccessString,
  createIntegrationCredentials,
  type IntegrationAccess,
  type IntegrationCredentials,
} from './integration.js';
