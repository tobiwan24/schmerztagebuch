// Zwei Geräte desselben Kontos (zwei Browser-Kontexte, je eigener virtueller Authenticator). Gerät B kommt per
// Backup-Code dazu (A-023) — ein kopierter Passkey liefert im virtuellen Authenticator keine PRF.
import { test, expect, type Page } from '@playwright/test';
import { addDeviceWithBackupCode, addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced', { timeout: 20_000 });
/** Sync-Auslöser „App wieder im Vordergrund" (Spec 04). */
const foreground = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function fieldsOf(page: Page, entryRow: number): Promise<string[]> {
  await go(page, '/history');
  await page.getByTestId('entry-row').nth(entryRow).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
  return page.getByTestId('entry-field').allTextContents();
}

test.describe('Zwei Geräte', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
  });

  test('SYN-06: zwei Geräte bearbeiten offline, gehen online → beide konvergieren auf identischen Zustand', async ({ page: a, browser }) => {
    await addVirtualAuthenticator(a);
    const user = uniqueUser('syn06');
    const code = await onboardWithCloud(a, user);
    // Ausgangseintrag auf A
    await go(a, '/entry/new');
    await a.getByLabel(/Schmerzstärke/).fill('3');
    await a.getByLabel('Notizen').fill('STB-E2E-MARKER Startnotiz');
    await a.getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByTestId('entry-time')).toBeVisible();
    await synced(a);

    const b = await addDeviceWithBackupCode(browser, user, code);
    await synced(b);
    await expect(b.getByTestId('entry-row')).toHaveCount(1);

    // beide offline bearbeiten: A die Notiz, B die Schmerzstärke
    await a.context().setOffline(true);
    await b.context().setOffline(true);
    await go(a, '/history');
    await a.getByTestId('entry-row').first().click();
    await a.getByRole('link', { name: 'Bearbeiten' }).click();
    await a.getByLabel('Notizen').fill('STB-E2E-MARKER von A');
    await a.getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByTestId('entry-time')).toBeVisible();

    await go(b, '/history');
    await b.getByTestId('entry-row').first().click();
    await b.getByRole('link', { name: 'Bearbeiten' }).click();
    await b.getByLabel(/Schmerzstärke/).fill('8');
    await b.getByRole('button', { name: 'Speichern' }).click();
    await expect(b.getByTestId('entry-time')).toBeVisible();
    await expect(a.getByTestId('sync-status')).toHaveAttribute('data-state', 'offline');
    await expect(b.getByTestId('sync-status')).toHaveAttribute('data-state', 'offline');

    // online: A zuerst, dann B (Konflikt → Merge), dann A holt B's Stand
    await a.context().setOffline(false);
    await synced(a);
    await b.context().setOffline(false);
    await synced(b);
    const fb = await fieldsOf(b, 0);
    expect(fb.join(' | ')).toContain('8');
    expect(fb.join(' | ')).toContain('STB-E2E-MARKER von A');
    const fa = await expect
      .poll(async () => {
        await foreground(a);
        await synced(a);
        return fieldsOf(a, 0);
      }, { timeout: 20_000 })
      .toEqual(fb)
      .then(() => fieldsOf(a, 0));
    expect(fa).toEqual(fb);
    expect(fa.join(' | ')).toContain('8');
    expect(fa.join(' | ')).toContain('STB-E2E-MARKER von A');
    await b.context().close();
  });

  test('BLK-05: Vorlagen-Reihenfolge per Drag & Drop bleibt auf dem Zweitgerät erhalten', async ({ page: a, browser }) => {
    await addVirtualAuthenticator(a);
    const user = uniqueUser('blk05');
    const code = await onboardWithCloud(a, user);
    await go(a, '/more/templates');
    await a.getByRole('button', { name: /Migräne-Tracking/ }).click();
    await expect(a.getByTestId('template-row')).toHaveCount(2);
    const names = (p: Page) => p.getByTestId('template-row').locator('span.flex-1 > span:first-child').allTextContents();

    // Ziehen: Migräne nach oben
    const handle = a.getByRole('button', { name: 'Migräne-Tracking verschieben' });
    const from = (await handle.boundingBox())!;
    const top = (await a.getByTestId('template-row').first().boundingBox())!;
    await a.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await a.mouse.down();
    await a.mouse.move(from.x + from.width / 2, top.y + 4, { steps: 8 });
    await a.mouse.up();
    await expect.poll(() => names(a)).toEqual(['Migräne-Tracking', 'Allgemeines Schmerz-Tagebuch']);
    await expect(a.getByTestId('template-list')).toHaveAttribute('aria-busy', 'false');
    await synced(a);

    const b = await addDeviceWithBackupCode(browser, user, code);
    await synced(b);
    await go(b, '/more/templates');
    await expect.poll(() => names(b)).toEqual(['Migräne-Tracking', 'Allgemeines Schmerz-Tagebuch']);

    // Änderung auf B kommt auf A an
    await b.getByRole('button', { name: 'Allgemeines Schmerz-Tagebuch verschieben' }).press('ArrowUp');
    await expect.poll(() => names(b)).toEqual(['Allgemeines Schmerz-Tagebuch', 'Migräne-Tracking']);
    // A kommt (ggf. mehrmals) in den Vordergrund, bis B's Änderung übertragen und abgeholt ist
    await expect
      .poll(async () => {
        await foreground(a);
        await synced(a);
        return names(a);
      }, { timeout: 20_000 })
      .toEqual(['Allgemeines Schmerz-Tagebuch', 'Migräne-Tracking']);
    await b.context().close();
  });
});
