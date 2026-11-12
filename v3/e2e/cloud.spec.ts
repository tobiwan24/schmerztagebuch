import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, onboardWithCloud, uniqueUser } from './helpers';

test.describe('Konto „Mit Konto"', () => {
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Virtueller Authenticator mit PRF nur über CDP (Chromium)');
  });

  test('Registrierung mit Passkey legt Konto und Tagebuch auf dem Server an; Antworten no-store', async ({ page }) => {
    await addVirtualAuthenticator(page);
    const user = uniqueUser('anna');
    await onboardWithCloud(page, user);

    const res = await page.request.get('/api/v1/diaries');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
    const diaries = (await res.json()) as { role: string; keyEpoch: number; wrappedDk: string }[];
    expect(diaries).toHaveLength(1);
    expect(diaries[0]).toMatchObject({ role: 'owner', keyEpoch: 1 });

    const me = (await (await page.request.get('/api/v1/auth/me')).json()) as { username: string; keys: { kind: string }[] };
    expect(me.username).toBe(user);
    expect(me.keys.map((k) => k.kind).sort()).toEqual(['identity-priv-enc', 'identity-pub', 'umk-wrap-backup', 'umk-wrap-passkey']);
  });

  test('vergebener Benutzername wird gemeldet', async ({ page, context }) => {
    const user = uniqueUser('berta');
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, user);

    const other = await context.browser()!.newContext();
    const page2 = await other.newPage();
    await page2.goto('/');
    await page2.getByRole('button', { name: 'Weiter' }).click();
    await page2.getByRole('button', { name: /Mit Konto/ }).click();
    await page2.getByLabel('Benutzername').fill(user);
    await page2.getByRole('button', { name: 'Weiter' }).click();
    await expect(page2.getByText('Dieser Benutzername ist schon vergeben.')).toBeVisible();
    await other.close();
  });
});
