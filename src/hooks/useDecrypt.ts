import { useCallback } from 'react';
import { getSessionPassword, getSessionKey, isSessionValid } from '../utils/auth';
import { decryptData, decryptWithKey } from '../utils/crypto';
import { getCloudEncryptionKey } from '../utils/entryEncryption';
import type { Entry } from '../types/database';
import type { Block } from '../types/blocks';

export function useDecrypt() {
  const decrypt = useCallback(async (entry: Entry): Promise<Block[] | null> => {
    if (!entry.encrypted) return JSON.parse(entry.data) as Block[];

    // Cloud-DEK hat Vorrang (siehe utils/entryEncryption.ts): Cloud-verknüpfte Geräte
    // entschlüsseln v2-Einträge zuerst mit dem DEK, unabhängig von der lokalen
    // Passwort-Session. Fallback auf den lokalen Pfad, falls das fehlschlägt (z.B. ein
    // Alt-Eintrag, der noch mit dem lokalen Passwort-Schlüssel verschlüsselt ist).
    if (entry.encryptionVersion === 2) {
      const cloudKey = await getCloudEncryptionKey();
      if (cloudKey) {
        try {
          const decrypted = await decryptWithKey(entry.data, cloudKey);
          return JSON.parse(decrypted) as Block[];
        } catch {
          // fällt durch auf den lokalen Entschlüsselungspfad unten
        }
      }
    }

    if (!isSessionValid()) return null;

    if (entry.encryptionVersion === 2) {
      const key = await getSessionKey();
      if (!key) return null;
      const decrypted = await decryptWithKey(entry.data, key);
      return JSON.parse(decrypted) as Block[];
    } else {
      const password = getSessionPassword();
      if (!password) return null;
      const decrypted = await decryptData(entry.data, password);
      return JSON.parse(decrypted) as Block[];
    }
  }, []);

  return { decrypt };
}
