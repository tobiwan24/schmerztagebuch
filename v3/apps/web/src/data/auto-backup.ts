// Auto-Sicherung (Spec 07 „Auto-Sicherung", EXP-17): verschlüsselte Backup-Datei (Format `.stbbackup`) in einer eigenen
// IndexedDB `stb-v3-autobackup`, getrennt von `stb-v3`; nur die letzte Sicherung bleibt (A-066).
// Schlüssel: zufälliger Sicherungsschlüssel (BK), mit der UMK verpackt. Die Faktor-Wraps der UMK (Passwort, Backup-Code,
// Passkey) liegen als Kopie daneben — die Wiederherstellung braucht also einen der Faktoren, auch wenn `stb-v3` gelöscht ist.
import {
  CryptoError, DOMAINS, fromBase64Url, openBackupFile, parseBackupCode, sealBackupFile, toBase64Url, unwrapUmk, type UmkFactor, type UmkWrap,
} from '@stb/crypto';
import { parseExport, type ExportV1 } from '@stb/export';
import { AutoBackupDb, AUTO_BACKUP_DB, AUTO_BACKUP_MIN_INTERVAL_MS, autoBackupInfo, type AutoBackupRecord } from './auto-backup-store';

export { AutoBackupDb, AUTO_BACKUP_DB, AUTO_BACKUP_MIN_INTERVAL_MS, autoBackupInfo, type AutoBackupRecord };

const subtle = () => globalThis.crypto.subtle;
const aad = () => new TextEncoder().encode(DOMAINS.autoBackupKey);

async function sealKey(umk: CryptoKey, bk: string): Promise<AutoBackupRecord['keyBox']> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad() }, umk, new TextEncoder().encode(bk)));
  return { iv: toBase64Url(iv), ct: toBase64Url(ct) };
}

async function openKey(umk: CryptoKey, box: AutoBackupRecord['keyBox']): Promise<string> {
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromBase64Url(box.iv), additionalData: aad() }, umk, fromBase64Url(box.ct));
  return new TextDecoder().decode(pt);
}

export interface AutoBackupDeps {
  store: AutoBackupDb;
  umk: CryptoKey;
  wraps: UmkWrap[];
  /** Vollständiger JSON-v1-Export als Text. */
  /** `empty`: keine Tagebücher/Einträge — dann wird eine vorhandene Sicherung nie überschrieben. */
  buildExport(): Promise<{ text: string; exportedAt: string; empty: boolean }>;
  now(): number;
}

/**
 * Schreibt die Sicherung, wenn die letzte älter als 1 Tag ist (`force`: immer, z. B. vor einem Update).
 * Gibt `'written'` oder `'skipped'` zurück.
 */
export async function runAutoBackup(deps: AutoBackupDeps, opts: { force?: boolean } = {}): Promise<'written' | 'skipped'> {
  const prev = await deps.store.backups.get('latest');
  if (!opts.force && prev && deps.now() - Date.parse(prev.createdAt) < AUTO_BACKUP_MIN_INTERVAL_MS) return 'skipped';
  const { text, exportedAt, empty } = await deps.buildExport();
  if (empty) return 'skipped';
  let bk: string | undefined;
  let keyBox = prev?.keyBox;
  if (prev) {
    try {
      bk = await openKey(deps.umk, prev.keyBox);
    } catch {
      bk = undefined; // andere UMK (z. B. neues Konto) → neuer Schlüssel
    }
  }
  if (!bk) {
    bk = toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
    keyBox = await sealKey(deps.umk, bk);
  }
  const file = await sealBackupFile(text, { kind: 'password', password: bk }, exportedAt);
  await deps.store.backups.put({ id: 'latest', v: 1, createdAt: new Date(deps.now()).toISOString(), wraps: deps.wraps, keyBox: keyBox!, file });
  return 'written';
}

/** Stellt den Inhalt der Auto-Sicherung mit einem Faktor (Passwort oder Backup-Code) wieder her. */
export async function readAutoBackup(store: AutoBackupDb, factor: UmkFactor): Promise<ExportV1> {
  const rec = await store.backups.get('latest');
  if (!rec) throw new Error('Keine Auto-Sicherung vorhanden');
  if (factor.kind === 'backup') factor = { kind: 'backup', code: await parseBackupCode(factor.code) };
  let umk: CryptoKey | undefined;
  for (const w of rec.wraps.filter((x) => x.factor === factor.kind)) {
    try {
      umk = await unwrapUmk(w, factor);
      break;
    } catch {
      // nächster Wrap gleicher Art
    }
  }
  if (!umk) throw new CryptoError('unwrap-failed', `Entsperren mit ${factor.kind} fehlgeschlagen`);
  const bk = await openKey(umk, rec.keyBox);
  return parseExport(await openBackupFile(rec.file, { kind: 'password', password: bk }));
}
