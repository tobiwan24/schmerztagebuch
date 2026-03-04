import { useCallback } from 'react';
import { getSessionPassword, getSessionKey, isSessionValid } from '../utils/auth';
import { decryptData, decryptWithKey } from '../utils/crypto';
import type { Entry } from '../types/database';
import type { Block } from '../types/blocks';

export function useDecrypt() {
  const decrypt = useCallback(async (entry: Entry): Promise<Block[] | null> => {
    if (!entry.encrypted) return JSON.parse(entry.data) as Block[];
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
