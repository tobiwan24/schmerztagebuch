// src/utils/entryEncryption.ts
// Ermittelt den aktuell aktiven Verschlüsselungsschlüssel für NEUE/BEARBEITETE Entries.
//
// INTERPRETATION (Spec regelt das Zusammenspiel nicht explizit, siehe Abschlussbericht):
// Sobald ein Gerät per Cloud-Sync verknüpft ist, hat der Cloud-DEK Vorrang vor der
// bestehenden lokalen Passwort-Verschlüsselung — nach der Erstmigration (siehe
// cloudMigrationService.ts) sind alle Bestands-Entries bereits mit dem DEK verschlüsselt;
// ohne diesen Vorrang würden neue/bearbeitete Einträge mit dem falschen Schlüssel
// verschlüsselt und wären für andere Geräte über die Cloud nicht mehr entschlüsselbar.
// Nutzer OHNE Cloud-Sync sind hiervon unberührt (Fallback exakt wie bisher).

import { getCloudSessionDEK, isCloudSyncEnabled } from '../services/cloudAuthService';

/**
 * Liefert den DEK, wenn dieses Gerät mit einem Cloud-Account verknüpft und die
 * Cloud-Session aktiv ist — sonst `null` (Aufrufer fällt auf die bestehende
 * lokale Passwort-Logik zurück).
 */
export async function getCloudEncryptionKey(): Promise<CryptoKey | null> {
  if (!(await isCloudSyncEnabled())) return null;
  return await getCloudSessionDEK();
}
