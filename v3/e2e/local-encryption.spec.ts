// Lokale Verschlüsselung (Spec 02, A-093/A-125, DM-18): Schalter „Daten auf dem Gerät verschlüsseln“, Klartext-Scan der IndexedDB.
import { test, expect, type Download, type Page } from '@playwright/test';
import { PASSWORD, addEntry, go, onboardWithPassword } from './helpers';

const MARKER = 'STB-PLAINTEXT-MARKER-DM18';

async function text(d: Download): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of (await d.createReadStream())!) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Alle Stores von `stb-v3` als JSON-Text (Bytes als Latin-1, damit ein Marker in Binärdaten gefunden würde) + Codec-Zählung der Records. */
async function scanDb(page: Page): Promise<{ dump: string; codecs: Record<string, number> }> {
  return page.evaluate(
    () =>
      new Promise<{ dump: string; codecs: Record<string, number> }>((resolve, reject) => {
        const req = indexedDB.open('stb-v3');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const names = Array.from(db.objectStoreNames);
          const tx = db.transaction(names, 'readonly');
          const out: Record<string, unknown[]> = {};
          const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');
          for (const n of names) {
            const all = tx.objectStore(n).getAll();
            all.onsuccess = () => (out[n] = all.result);
          }
          tx.oncomplete = () => {
            db.close();
            const dump = JSON.stringify(out, (_k, v: unknown) =>
              v instanceof ArrayBuffer
                ? latin1(new Uint8Array(v))
                : ArrayBuffer.isView(v)
                  ? latin1(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
                  : v instanceof Blob
                    ? `blob:${v.size}`
                    : v,
            );
            const codecs: Record<string, number> = {};
            for (const r of out['records'] as { codec: string }[]) codecs[r.codec] = (codecs[r.codec] ?? 0) + 1;
            resolve({ dump, codecs });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

async function unlock(page: Page) {
  await page.getByTestId('lock-banner').getByRole('link', { name: 'Entsperren' }).click();
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Mit Passwort entsperren' }).click();
  await expect(page.getByTestId('lock-banner')).toHaveCount(0, { timeout: 30_000 });
}

async function hasDeviceRow(page: Page, id: string): Promise<boolean> {
  return page.evaluate(
    (rowId) =>
      new Promise<boolean>((resolve, reject) => {
        const req = indexedDB.open('stb-v3');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('device').objectStore('device').get(rowId);
          get.onsuccess = () => (db.close(), resolve(get.result !== undefined));
          get.onerror = () => (db.close(), reject(get.error));
        };
      }),
    id,
  );
}

async function hasAutoBackup(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('stb-v3-autobackup');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('backups')) return (db.close(), resolve(false));
          const get = db.transaction('backups').objectStore('backups').get('latest');
          get.onsuccess = () => (db.close(), resolve(!!get.result));
          get.onerror = () => (db.close(), resolve(false));
        };
        req.onerror = () => resolve(false);
      }),
  );
}

test.describe('Lokale Verschlüsselung', () => {
  test.describe.configure({ timeout: 120_000 });

  test('DM-18: Schalter an → IndexedDB ohne Klartext-Marker, App arbeitet entsperrt normal, Auto-Sicherung und Export funktionieren', async ({ page }) => {
    // Die Auto-Sicherung läuft 30 s nach dem letzten Schreiben — die Seitenuhr vorspulen statt zu warten.
    await page.clock.install();
    await onboardWithPassword(page);
    await addEntry(page, '5', `${MARKER} eins`);
    await addEntry(page, '6', `${MARKER} zwei`);
    // Kontrolle des Scanners: vorher steht der Marker im Klartext in der Datenbank.
    const before = await scanDb(page);
    expect(before.dump).toContain(MARKER);
    expect(before.codecs['aes']).toBeUndefined();

    await go(page, '/more/settings/sicherheit');
    const card = page.getByTestId('local-encryption');
    await card.getByLabel('Daten auf dem Gerät verschlüsseln').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('endgültig');
    await dialog.getByRole('button', { name: 'Verschlüsseln und einschalten' }).click();
    await expect(card.getByTestId('local-encryption-done')).toBeVisible({ timeout: 30_000 });
    await expect(card.getByLabel('Daten auf dem Gerät verschlüsseln')).toBeDisabled();

    // Danach: kein Klartext mehr, alle Records aes
    const after = await scanDb(page);
    expect(after.dump).not.toContain(MARKER);
    expect(after.codecs['plain']).toBeUndefined();
    expect(after.codecs['aes']).toBeGreaterThan(2);

    // Normale Nutzung entsperrt: Verlauf zeigt die Einträge, ein neuer Eintrag wird verschlüsselt geschrieben
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
    await addEntry(page, '7', `${MARKER} drei`);
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(3);
    const written = await scanDb(page);
    expect(written.dump).not.toContain(MARKER);
    expect(written.codecs['plain']).toBeUndefined();

    // Auto-Sicherung (liest über das Repository) entsteht auch mit verschlüsselten Daten
    await page.clock.fastForward(40_000);
    await expect.poll(() => hasAutoBackup(page), { timeout: 60_000 }).toBe(true);
    // Persistierter Suchindex (ANA-33): entsteht nach einer Ruhezeit und enthält keinen Klartext
    await expect.poll(() => hasDeviceRow(page, 'search-index'), { timeout: 30_000 }).toBe(true);
    expect((await scanDb(page)).dump).not.toContain(MARKER);

    // Export liefert den Klartext der Einträge (über das Repository)
    await go(page, '/more/export');
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Herunterladen', exact: true }).click()]);
    const body = await text(json);
    expect(body).toContain(`${MARKER} eins`);
    expect(body).toContain(`${MARKER} drei`);

    // Nach dem Neuladen (Sitzung weg) entsperren: derselbe Schlüssel liest alles wieder
    await page.reload();
    await unlock(page);
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(3);
    // Kaltstart-Suche aus dem gespeicherten Index findet den Eintrag
    await page.getByLabel('Suchen').fill('drei');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
  });

  test('DM-18: eine unterbrochene Umstellung wird nach dem Entsperren fortgesetzt', async ({ page }) => {
    await onboardWithPassword(page);
    await addEntry(page, '5', `${MARKER} vorher`);
    expect((await scanDb(page)).dump).toContain(MARKER);
    // Zustand "eingeschaltet, aber noch nichts umgestellt" (wie nach einem Abbruch der Migration)
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open('stb-v3');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('device', 'readwrite');
            tx.objectStore('device').put({ id: 'local-encryption', value: { enabled: true, enabledAt: new Date().toISOString() } });
            tx.oncomplete = () => (db.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        }),
    );
    await page.reload();
    await unlock(page);
    await expect.poll(async () => (await scanDb(page)).dump.includes(MARKER), { timeout: 30_000 }).toBe(false);
    expect((await scanDb(page)).codecs['plain']).toBeUndefined();
    await go(page, '/history');
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    await go(page, '/more/settings/sicherheit');
    await expect(page.getByTestId('local-encryption-done')).toBeVisible();
  });
});
