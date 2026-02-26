import { useCallback } from 'react';
import { getSessionPassword } from '../utils/auth';
import { decryptData } from '../utils/crypto';
import type { Entry } from '../types/database';
import type { Block } from '../types/blocks';

export function useDecrypt() {
  const decrypt = useCallback(async (entry: Entry): Promise<Block[] | null> => {
    if (!entry.encrypted) return JSON.parse(entry.data) as Block[];
    const password = getSessionPassword();
    if (!password) return null;
    const decrypted = await decryptData(entry.data, password);
    return JSON.parse(decrypted) as Block[];
  }, []);

  return { decrypt };
}
