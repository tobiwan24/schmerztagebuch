// src/services/cloudMigrationService.ts
// Einmaliger Migrationsablauf beim Erst-Cloud-Setup (Spec-Abschnitt "Datenmigrationsablauf",
// Schritte 5–6). Wird von der CloudSyncSetup-UI NACH Passkey-Registrierung + Pflicht-
// Backup-Code aufgerufen, bevor der Erst-Push (runSync in syncService.ts) läuft.
//
// Templates werden hier NICHT angefasst — deren `blocks` bleiben lokal wie bisher im
// Klartext in Dexie; die Verschlüsselung für den Server passiert transparent erst bei
// der Push-Konvertierung in syncService.ts. Nur entries.data (die einzige bereits heute
// potenziell lokal verschlüsselte Datenmenge) muss hier einmalig vom alten lokalen Schema
// auf DEK-Verschlüsselung umgestellt werden.

import db from '../db';
import { getEntries } from '../db';
import { getSessionKey, getSessionPassword, getEncryptionMode } from '../utils/auth';
import { decryptData, decryptWithKey, encryptWithKey } from '../utils/crypto';

export interface MigrationProgress {
  done: number;
  total: number;
}

/**
 * Entschlüsselt (falls nötig, mit dem alten lokalen Schema) alle Bestands-Entries und
 * verschlüsselt sie neu mit dem Cloud-DEK. Voraussetzung: Falls lokal encryptionMode='full'
 * aktiv ist, muss eine gültige lokale Passwort-Session vorliegen (durch den bestehenden
 * App-weiten Auth-Gate beim Erreichen von 'home' bereits sichergestellt — hier keine
 * erneute Passwort-Abfrage nötig).
 */
export async function migrateLocalEntriesToCloud(
  dek: CryptoKey,
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ migratedCount: number; skippedCount: number }> {
  const mode = await getEncryptionMode();
  const localKey = mode === 'full' ? await getSessionKey() : null;
  const localPassword = mode === 'full' ? getSessionPassword() : null;

  const entries = await getEntries();
  const total = entries.length;
  let migratedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    let plaintext: string | null = null;

    if (!entry.encrypted) {
      plaintext = entry.data;
    } else if (entry.encryptionVersion === 2 && localKey) {
      plaintext = await decryptWithKey(entry.data, localKey);
    } else if (localPassword) {
      plaintext = await decryptData(entry.data, localPassword);
    }

    if (plaintext === null) {
      // Verschlüsselt, aber keine lokale Session verfügbar — sollte durch den bestehenden
      // App-Auth-Gate praktisch nicht vorkommen. Defensiv überspringen statt Datenverlust.
      skippedCount++;
      onProgress?.({ done: i + 1, total });
      continue;
    }

    const reEncrypted = await encryptWithKey(plaintext, dek);
    await db.entries.update(entry.id!, {
      data: reEncrypted,
      encrypted: true,
      encryptionVersion: 2,
      encryptionSource: 'cloud',
      updatedAt: new Date().toISOString(),
    });
    migratedCount++;
    onProgress?.({ done: i + 1, total });
  }

  return { migratedCount, skippedCount };
}
