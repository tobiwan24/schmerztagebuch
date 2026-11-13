import { test, expect, type Page } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, swReady, uniqueUser } from './helpers';

const status = (page: Page) => page.getByTestId('sync-status');

async function quickEntry(page: Page) {
  await go(page, '/');
  await page.getByRole('link', { name: 'Schnell eintragen' }).click();
  const slider = page.getByLabel(/Schmerzstärke/);
  const box = (await slider.boundingBox())!;
  await slider.click({ position: { x: box.width * 0.5, y: box.height / 2 } });
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
}

test.describe('Sync im UI', () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('sync'));
  });

  test('SYN-14: Sync-Status zeigt synchronisiert / ausstehend n / Fehler korrekt', async ({ page, context }) => {
    await expect(status(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    await expect(status(page)).toHaveText('Synchronisiert');

    // offline: Änderung bleibt ausstehend und wird gezählt
    await context.setOffline(true);
    await quickEntry(page);
    await expect(status(page)).toHaveAttribute('data-state', 'offline');
    await expect(status(page)).toHaveText('Offline · ausstehend: 1');

    // wieder online → automatisch übertragen
    await context.setOffline(false);
    await expect(status(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    await expect(status(page)).toHaveAttribute('data-pending', '0');

    // Server-Fehler → „Sync-Fehler" mit „Erneut versuchen"; danach wieder synchronisiert
    await page.route('**/api/v1/sync/push', (r) => r.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await quickEntry(page);
    await expect(status(page)).toHaveAttribute('data-state', 'error', { timeout: 15_000 });
    await expect(status(page)).toContainText('Sync-Fehler');
    await expect(status(page)).toHaveAttribute('data-pending', '1');
    await page.unroute('**/api/v1/sync/push');
    await status(page).getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(status(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
  });

  test('SYN-09: Sync-Antworten tragen no-store; der Service Worker beantwortet keine /api-Anfrage aus dem Cache', async ({ page, context }) => {
    await expect(status(page)).toHaveAttribute('data-state', 'synced', { timeout: 15_000 });
    await swReady(page);
    const pull = await page.request.get(`/api/v1/sync/pull?diaryId=${encodeURIComponent((await (await page.request.get('/api/v1/diaries')).json())[0].diaryId)}&since=0&limit=10`);
    expect(pull.status()).toBe(200);
    expect(pull.headers()['cache-control']).toBe('no-store');

    // Aus der Seite (über den Service Worker): online kommt die Antwort vom Server, offline schlägt sie fehl
    const fromPage = () => page.evaluate(async () => {
      try {
        const r = await fetch('/api/v1/auth/me', { credentials: 'include' });
        return { ok: r.ok, cc: r.headers.get('cache-control') };
      } catch {
        return { ok: false, cc: 'network-error' };
      }
    });
    expect(await fromPage()).toEqual({ ok: true, cc: 'no-store' });
    await context.setOffline(true);
    expect(await fromPage()).toEqual({ ok: false, cc: 'network-error' });
    const cached = await page.evaluate(async () => {
      const hits: string[] = [];
      for (const k of await caches.keys()) for (const req of await (await caches.open(k)).keys()) if (new URL(req.url).pathname.startsWith('/api/')) hits.push(req.url);
      return hits;
    });
    expect(cached).toEqual([]);
    await context.setOffline(false);
  });
});
