// SHR-13: Mitglied entfernen → Rotation des Tagebuchschlüssels mit Fortschritt; das verbleibende Mitglied synchronisiert weiter,
// das entfernte bekommt 403 und keine neuen Daten. Drei Konten (Chromium, virtueller Authenticator).
import { test, expect, type Page } from '@playwright/test';
import { addEntry, addVirtualAuthenticator, foreground, go, inviteMember, onboardWithCloud, openMembers, uniqueUser } from './helpers';

/** Anzahl Treffer der Verlaufssuche nach Text (nach einem Sync-Auslöser). */
async function hits(page: Page, text: string): Promise<number> {
  await foreground(page);
  await go(page, '/history');
  await page.getByLabel('Suchen').fill(text);
  return page.getByTestId('entry-row').count();
}

test.describe('DK-Rotation', () => {
  test.describe.configure({ timeout: 240_000 });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'drei Konten mit virtuellem Authenticator (Chromium)');
  });

  test('SHR-13: Mitglied entfernen → Rotation mit Fortschritt; verbleibendes Mitglied synchronisiert weiter, entferntes bekommt 403 und nichts Neues', async ({ page: a, browser }) => {
    const owner = uniqueUser('rot-o');
    const stays = uniqueUser('rot-b');
    const leaves = uniqueUser('rot-c');
    await addVirtualAuthenticator(a);
    await onboardWithCloud(a, owner);
    await addEntry(a, '4', 'STB-ROT-VORHER');

    const b = await inviteMember(a, browser, stays, 2);
    const c = await inviteMember(a, browser, leaves, 3);
    const statuses: number[] = [];
    c.page.on('response', (r) => {
      if (r.url().includes('/api/v1/sync/pull')) statuses.push(r.status());
    });
    // beide Mitglieder sehen den ersten Eintrag
    await expect.poll(() => hits(b.page, 'STB-ROT-VORHER'), { timeout: 45_000, intervals: [1000, 2000] }).toBe(1);
    await expect.poll(() => hits(c.page, 'STB-ROT-VORHER'), { timeout: 45_000, intervals: [1000, 2000] }).toBe(1);

    // c entfernen → Rotation läuft und endet; Fortschritt sichtbar
    await openMembers(a);
    await a.getByTestId('member').filter({ hasText: leaves }).getByRole('button', { name: 'Entfernen' }).click();
    await a.getByRole('dialog').getByRole('button', { name: 'Entfernen' }).click();
    await expect(a.getByTestId('rotation-status')).toBeVisible();
    await expect(a.getByTestId('rotation-status')).toHaveAttribute('data-status', 'done', { timeout: 60_000 });
    await expect(a.getByTestId('member')).toHaveCount(2);

    // alle neuen Daten laufen in der neuen Epoche: Owner schreibt weiter, b synchronisiert weiter (neuer Wrap), b schreibt zurück
    await addEntry(a, '6', 'STB-ROT-NACHHER');
    await expect.poll(() => hits(b.page, 'STB-ROT-NACHHER'), { timeout: 60_000, intervals: [1000, 2000] }).toBe(1);
    await expect.poll(() => hits(b.page, 'STB-ROT-VORHER'), { timeout: 20_000 }).toBe(1);
    await addEntry(b.page, '3', 'STB-ROT-VON-B');
    await expect.poll(() => hits(a, 'STB-ROT-VON-B'), { timeout: 60_000, intervals: [1000, 2000] }).toBe(1);

    // c: Server liefert 403, der neue Eintrag kommt nie an
    await expect.poll(async () => (await hits(c.page, 'STB-ROT-NACHHER'), statuses.includes(403)), { timeout: 30_000, intervals: [1000, 2000] }).toBe(true);
    await foreground(c.page);
    await go(c.page, '/history');
    await expect(c.page.getByTestId('entry-row')).toHaveCount(1); // nur der Eintrag von vorher
    await expect(c.page.getByTestId('entry-row')).not.toContainText(/STB-ROT-(NACHHER|VON-B)/);

    await b.ctx.close();
    await c.ctx.close();
  });
});
