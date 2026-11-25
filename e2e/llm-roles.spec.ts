// BLK-53: „Rollen vorschlagen“ im Vorlagen-Editor (Fake-Antworten per page.route, nie ein echter Provider).
// VOI-16: Der Knopf ist ausgeblendet bei Opt-in aus oder ohne Konto und deaktiviert offline.
import { test, expect, type Page, type Route } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const STATUS = { provider: 'anthropic', model: 'claude-opus-5-5', thirdParty: true, dailyTokens: 50_000, usedTokens: 0 };

interface RolesRequest { templateName: string; version: { blocks: { id: string; label: string }[] } }

async function mockLlm(page: Page, answer: (req: RolesRequest) => unknown) {
  const requests: RolesRequest[] = [];
  await page.route('**/api/v1/llm/status', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATUS) }));
  await page.route('**/api/v1/llm/roles', (r: Route) => {
    const req = r.request().postDataJSON() as RolesRequest;
    requests.push(req);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(req)) });
  });
  return requests;
}

async function openEditor(page: Page) {
  await go(page, '/more/templates');
  await page.getByTestId('template-row').first().getByRole('link', { name: /bearbeiten$/ }).click();
  await expect(page.getByTestId('block-editor-card').first()).toBeVisible();
}

test.describe('Rollen vorschlagen', () => {
  test.describe.configure({ timeout: 150_000 });

  test('BLK-53: Freigabe zeigt Bezeichnungen und Empfänger, Vorschläge einzeln übernehmen oder verwerfen, unbekannte Blöcke fallen weg', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    const requests = await mockLlm(page, (req) => ({
      suggestions: [
        { blockId: req.version.blocks[0]!.id, role: 'activity', reason: 'Belastung' },
        { blockId: req.version.blocks[1]!.id, role: 'mood' },
        { blockId: 'erfunden', role: 'note' },
      ],
    }));
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('rollen'));
    await page.evaluate(() => localStorage.setItem('stb-v3-llm', '1'));
    await openEditor(page);

    const cards = page.getByTestId('block-editor-card');
    const roleBefore = await cards.nth(1).getByLabel('Rolle').inputValue();
    await page.getByTestId('llm-roles-open').click();
    const consent = page.getByRole('dialog');
    await expect(consent.getByTestId('llm-consent-recipient')).toHaveText('Anthropic (Drittanbieter, USA)');
    await expect(consent.getByTestId('llm-consent-text')).toContainText(await cards.first().getByLabel('Bezeichnung', { exact: true }).inputValue());
    expect(requests).toHaveLength(0); // vor „Senden“ geht nichts raus
    await consent.getByRole('button', { name: 'Senden' }).click();

    const items = page.getByTestId('llm-roles-item');
    await expect(items).toHaveCount(2);
    await items.nth(0).getByRole('button', { name: 'Übernehmen' }).click();
    await expect(items).toHaveCount(1);
    await items.nth(0).getByRole('button', { name: 'Verwerfen' }).click();
    await expect(items).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Fertig' }).click();

    await expect(cards.first().getByLabel('Rolle')).toHaveValue('activity');
    await expect(cards.nth(1).getByLabel('Rolle')).toHaveValue(roleBefore); // verworfen: unverändert
    expect(requests).toHaveLength(1);
  });

  test('VOI-16: Rollenknopf ist ohne Opt-in ausgeblendet und offline deaktiviert', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await mockLlm(page, () => ({ suggestions: [] }));
    await addVirtualAuthenticator(page);
    await onboardWithCloud(page, uniqueUser('rollen2'));
    await openEditor(page);
    await expect(page.getByTestId('llm-roles-open')).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem('stb-v3-llm', '1'));
    await openEditor(page);
    await expect(page.getByTestId('llm-roles-open')).toBeEnabled();
    await page.context().setOffline(true);
    await expect(page.getByTestId('llm-roles-open')).toBeDisabled();
    await page.context().setOffline(false);
    await expect(page.getByTestId('llm-roles-open')).toBeEnabled();
  });

  test('VOI-16: ohne Konto gibt es keinen Rollenknopf, auch bei gesetztem Opt-in', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('stb-v3-llm', '1'));
    await onboardWithPassword(page);
    await openEditor(page);
    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    await expect(page.getByTestId('llm-roles-open')).toHaveCount(0);
  });
});
