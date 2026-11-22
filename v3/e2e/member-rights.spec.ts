// SHR-14: Der Besitzer erteilt einem Editor „Vorlagen bearbeiten“ → der Editor kann den Vorlagen-Editor nutzen, der Server nimmt
// template/templateVersion an; Entzug wirkt wieder (Chromium, zwei Konten mit virtuellem Authenticator).
import { test, expect, type Page } from '@playwright/test';
import { addVirtualAuthenticator, foreground, go, inviteMember, onboardWithCloud, openMembers, uniqueUser } from './helpers';

const SHARED = 'Gemeinsames Tagebuch';

/** Vorlagenliste des geteilten Tagebuchs (nach der Annahme per Sync beim Mitglied vorhanden). */
async function sharedTemplates(page: Page) {
  await foreground(page);
  await go(page, '/more/templates');
  await page.getByLabel('Tagebuch', { exact: true }).selectOption({ label: SHARED });
  // Beim Laden gilt kurz „darf bearbeiten“ (Mitgliederliste noch nicht gelesen): erst nach dem Einschwingen messen
  await page.waitForTimeout(1500);
}

test.describe('Feinere Rechte', () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(({ browserName }) => {
    test.skip(browserName !== 'chromium', 'zwei Konten mit virtuellem Authenticator (Chromium)');
  });

  test('SHR-14: Owner erteilt „Vorlagen bearbeiten“ → Editor legt eine Vorlage an (Server nimmt sie an), Entzug sperrt wieder', async ({ page: a, browser }) => {
    await addVirtualAuthenticator(a);
    await onboardWithCloud(a, uniqueUser('right-o'));
    // eindeutiger Name, damit das geteilte Tagebuch beim Mitglied von dessen eigenem unterscheidbar ist
    await go(a, '/more/diaries');
    await a.getByTestId('diary-card').getByRole('link', { name: 'Einstellungen' }).click();
    await a.getByLabel('Name').fill(SHARED);
    await a.getByRole('button', { name: 'Speichern' }).click();
    await expect(a.getByText('Gespeichert.')).toBeVisible();
    const memberName = uniqueUser('right-m');
    const b = await inviteMember(a, browser, memberName, 2);

    // ohne Recht: nur lesen
    await expect
      .poll(
        async () => {
          await sharedTemplates(b.page);
          return b.page.getByText('Nur der Besitzer des Tagebuchs kann Vorlagen ändern.').count();
        },
        { timeout: 45_000, intervals: [1000, 2000] },
      )
      .toBe(1);
    await expect(b.page.getByRole('link', { name: 'Neue leere Vorlage' })).toHaveCount(0);

    // Owner erteilt das Recht
    await openMembers(a);
    const row = a.getByTestId('member').filter({ hasText: memberName });
    await row.getByRole('button', { name: 'Vorlagen bearbeiten erlauben' }).click();
    await expect(row).toContainText('darf Vorlagen bearbeiten');

    // Editor: nach dem Sync (Mitgliederliste) ist der Editor offen
    await expect
      .poll(
        async () => {
          await sharedTemplates(b.page);
          return b.page.getByRole('link', { name: 'Neue leere Vorlage' }).count();
        },
        { timeout: 45_000, intervals: [1000, 2000] },
      )
      .toBe(1);
    await b.page.getByRole('link', { name: 'Neue leere Vorlage' }).click();
    await b.page.getByLabel('Name', { exact: true }).fill('STB-VORLAGE-VOM-EDITOR');
    await b.page.getByRole('button', { name: 'Speichern' }).click();
    await expect(b.page.getByRole('heading', { name: 'Vorlagen' })).toBeVisible();

    // Der Server hat sie angenommen: der Owner sieht die Vorlage (nicht in der Outbox des Editors hängengeblieben)
    await expect
      .poll(
        async () => {
          await foreground(a);
          await go(a, '/more/templates');
          return a.getByTestId('template-row').filter({ hasText: 'STB-VORLAGE-VOM-EDITOR' }).count();
        },
        { timeout: 60_000, intervals: [1000, 2000] },
      )
      .toBe(1);

    // Entzug: Editor ist wieder schreibgeschützt
    await openMembers(a);
    await a.getByTestId('member').filter({ hasText: memberName }).getByRole('button', { name: 'Vorlagen bearbeiten entziehen' }).click();
    await expect(a.getByTestId('member').filter({ hasText: memberName })).not.toContainText('darf Vorlagen bearbeiten');
    await expect
      .poll(
        async () => {
          await sharedTemplates(b.page);
          return b.page.getByText('Nur der Besitzer des Tagebuchs kann Vorlagen ändern.').count(); // positiv warten: beim Laden ist der Link kurz sichtbar
        },
        { timeout: 45_000, intervals: [1000, 2000] },
      )
      .toBe(1);
    await expect(b.page.getByRole('link', { name: 'Neue leere Vorlage' })).toHaveCount(0);
    await b.ctx.close();
  });
});
