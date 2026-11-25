/** HKDF-`info`-Strings zur Domain-Separation (Spec 03). */
export const DOMAINS = {
  umkWrapPasskey: 'stb/v3/umk-wrap/passkey',
  umkWrapBackup: 'stb/v3/umk-wrap/backup',
  umkWrapPassword: 'stb/v3/umk-wrap/password',
  dkWrapEcdh: 'stb/v3/dk-wrap/ecdh',
  share: 'stb/v3/share',
  deviceLocal: 'stb/v3/device-local',
  intake: 'stb/v3/intake',
  fingerprint: 'stb/v3/fingerprint',
  identitySeal: 'stb/v3/identity-seal',
  backupAuth: 'stb/v3/backup-auth',
  backupFile: 'stb/v3/backup-file',
  autoBackupKey: 'stb/v3/auto-backup-key',
  localDk: 'stb/v3/dk',
  integrationAccess: 'stb/v3/integration-access',
  searchIndex: 'stb/v3/search-index',
} as const;
