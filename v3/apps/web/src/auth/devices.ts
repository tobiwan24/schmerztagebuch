// Geräteliste und Abmelden (Spec 03, CRY-19). Der Gerätename liegt verschlüsselt (UMK) auf dem Server; ist er nicht
// lesbar (z. B. Gerät kam per Passkey-Login, Name noch mit Wegwerf-Schlüssel), bleibt `name` leer.
import { fromBase64Url } from '@stb/crypto';
import type { StbDb } from '../data/db.js';
import type { CryptoSession } from '../data/crypto-session.js';
import type { AccountApi, DeviceRecord } from './account-api.js';

export interface DeviceView {
  id: string;
  name: string | null;
  createdAt: number;
  revokedAt: number | null;
  current: boolean;
}

async function readName(umk: CryptoKey, nameCt: string): Promise<string | null> {
  const [iv, ct] = nameCt.split('.');
  if (!iv || !ct) return null;
  try {
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, umk, fromBase64Url(ct));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function loadDevices(api: Pick<AccountApi, 'me' | 'listDevices'>, umk: CryptoKey): Promise<DeviceView[]> {
  const [me, list] = await Promise.all([api.me(), api.listDevices()]);
  return Promise.all(
    list.map(async (d: DeviceRecord) => ({ id: d.id, name: await readName(umk, d.nameCt), createdAt: d.createdAt, revokedAt: d.revokedAt, current: d.id === me.deviceId })),
  );
}

/**
 * Abmelden auf diesem Gerät: Serversitzung beenden (Fehler egal — offline), dann Konto-Angaben, Wraps, DK-Wraps und
 * den Geräteschlüssel verwerfen. Einträge, Vorlagen, Tagebücher und die Geräte-Identität bleiben bis zum Löschen
 * (Gefahr-Zone) erhalten.
 */
export async function discardLocalKeys(db: StbDb, api: Pick<AccountApi, 'logout'>, session: Pick<CryptoSession, 'lock' | 'forgetDevice'>): Promise<void> {
  await api.logout().catch(() => undefined);
  session.lock();
  await session.forgetDevice();
  const ids = (await db.keys.toCollection().primaryKeys()).filter((id) => id === 'account' || id.startsWith('dk:'));
  await db.keys.bulkDelete(ids);
}
