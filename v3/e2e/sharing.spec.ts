import { test, expect, type Page, type Request } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, uniqueUser } from './helpers';

const foreground = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

async function addEntry(page: Page, pain: string, note: string) {
  await go(page, '/entry/new');
  await page.getByLabel(/Schmerzstärke/).fill(pain);
  await page.getByLabel('Notizen').fill(note);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByTestId('entry-time')).toBeVisible();
}

/** Verlauf nach Text durchsuchen, bis der Eintrag (nach Syncs) auftaucht; öffnet ihn. */
async function openEntryWith(page: Page, text: string) {
  await expect
    .poll(
      async () => {
        await foreground(page);
        await go(page, '/history');
        await page.getByLabel('Suchen').fill(text);
        return page.getByTestId('entry-row').count();
      },
      { timeout: 45_000, intervals: [1000, 2000] },
    )
    .toBe(1);
  await page.getByTestId('entry-row').first().click();
}

test.describe('Geteilte Tagebücher', () => {
  test.describe.configure({ timeout: 150_000 });

  test('SHR-01 SHR-02 SHR-10 SHR-09: Einladung zwischen zwei Konten, Geheimnis nie im Request, „Erfasst von", gemeinsame Bearbeitung', async ({ page: a, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'zwei Konten mit virtuellem Authenticator (Chromium)');
    const requests: string[] = [];
    const record = (r: Request) => requests.push(`${r.url()} ${r.postData() ?? ''}`);
    a.on('request', record);

    // Owner mit Eintrag
    const ownerName = uniqueUser('owner');
    await addVirtualAuthenticator(a);
    await onboardWithCloud(a, ownerName);
    await addEntry(a, '4', 'STB-E2E-MARKER vom Owner');

    // Einladung erzeugen
    await go(a, '/more/diaries');
    await a.getByTestId('diary-card').getByRole('link', { name: 'Mitglieder & Einladungen' }).click();
    await expect(a.getByTestId('member')).toHaveCount(1);
    await a.getByRole('button', { name: 'Darf eintragen' }).click();
    await a.getByRole('button', { name: 'Einladungslink erzeugen' }).click();
    const link = (await a.getByTestId('invite-link').textContent())!;
    const hash = new URL(link).hash;
    const secret = hash.split('.')[1]!;
    expect(secret.length).toBeGreaterThanOrEqual(16);

    // Eingeladene Person mit eigenem Konto
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
    const b = await ctx.newPage();
    b.on('request', record);
    await addVirtualAuthenticator(b);
    await onboardWithCloud(b, uniqueUser('member'));
    await go(b, `/invite${hash}`);
    await expect(b.getByTestId('invite-details')).toContainText('Mein Tagebuch');
    await expect(b.getByTestId('invite-details')).toContainText(`${ownerName} lädt dich ein — Rolle: Darf eintragen`);
    await b.getByRole('button', { name: 'Einladung annehmen' }).click();
    await expect(b.getByTestId('invite-accepted')).toBeVisible();

    // Owner-Sync bestätigt (prüft HMAC, verpackt DK) → zwei Mitglieder
    await expect
      .poll(
        async () => {
          await foreground(a);
          await go(a, '/more/diaries');
          await a.getByTestId('diary-card').getByRole('link', { name: 'Mitglieder & Einladungen' }).click();
          await a.getByTestId('members-card').waitFor();
          return a.getByTestId('member').count();
        },
        { timeout: 45_000, intervals: [1000, 2000] },
      )
      .toBe(2);
    await expect(a.getByTestId('safety-number')).toHaveCount(1);
    await expect.poll(async () => (await foreground(a), go(a, '/more/diaries'), a.getByTestId('open-invitations').count()), { timeout: 20_000 }).toBe(0);
    await a.getByTestId('diary-card').getByRole('link', { name: 'Mitglieder & Einladungen' }).click();
    await a.getByTestId('members-card').waitFor();
    const ownerSees = (await a.getByTestId('safety-number').textContent())!;

    // SHR-01: die eingeladene Person sieht die Einträge des Owners; SHR-10: „Erfasst von"
    await openEntryWith(b, 'STB-E2E-MARKER vom Owner');
    await expect(b.getByTestId('entry-field').filter({ hasText: 'Notizen' })).toContainText('STB-E2E-MARKER vom Owner');
    await expect(b.getByTestId('entry-author')).toHaveText(`Erfasst von ${ownerName}`);
    // Sicherheitsnummer auf beiden Seiten gleich
    await go(b, '/more/diaries');
    const shared = b.getByTestId('diary-card').filter({ has: b.getByRole('link', { name: 'Mitglieder & Einladungen' }) });
    let memberSees = '';
    for (let i = 0; i < (await shared.count()); i++) {
      await go(b, '/more/diaries');
      await b.getByTestId('diary-card').nth(i).getByRole('link', { name: 'Mitglieder & Einladungen' }).click();
      await b.getByTestId('members-card').waitFor();
      if ((await b.getByTestId('member').count()) === 2) {
        memberSees = (await b.getByTestId('safety-number').textContent())!;
        break;
      }
    }
    expect(memberSees).toBe(ownerSees);

    // SHR-09: beide bearbeiten denselben Eintrag gleichzeitig (offline), verschiedene Felder → zusammengeführt
    await openEntryWith(a, 'STB-E2E-MARKER vom Owner');
    await openEntryWith(b, 'STB-E2E-MARKER vom Owner');
    await a.context().setOffline(true);
    await ctx.setOffline(true);
    await a.getByRole('link', { name: 'Bearbeiten' }).click();
    await a.getByLabel(/Schmerzstärke/).fill('9');
    await a.getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByTestId('entry-time')).toBeVisible();
    await b.getByRole('link', { name: 'Bearbeiten' }).click();
    await b.getByLabel('Notizen').fill('STB-E2E-MARKER vom Owner, ergänzt vom Mitglied');
    await b.getByRole('button', { name: 'Speichern' }).click();
    await expect(b.getByTestId('entry-time')).toBeVisible();
    await a.context().setOffline(false);
    await ctx.setOffline(false);
    const merged = async (p: Page) => {
      await foreground(p);
      await go(p, '/history');
      await p.getByLabel('Suchen').fill('ergänzt vom Mitglied');
      if ((await p.getByTestId('entry-row').count()) !== 1) return 'Notiz fehlt';
      await p.getByTestId('entry-row').first().click();
      return (await p.getByTestId('entry-field').filter({ hasText: 'Schmerzstärke' }).textContent()) ?? '';
    };
    await expect.poll(() => merged(a), { timeout: 45_000, intervals: [1500, 2500] }).toContain('9');
    await expect.poll(() => merged(b), { timeout: 45_000, intervals: [1500, 2500] }).toContain('9');

    // SHR-02: das Geheimnis taucht in keinem Request auf (URL oder Body)
    expect(requests.length).toBeGreaterThan(10);
    expect(requests.filter((r) => r.includes(secret))).toEqual([]);
    await ctx.close();
  });
});
