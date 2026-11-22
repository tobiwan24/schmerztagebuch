// VOI-14: „Aus Text ausfüllen“ in Formular und Schnelleintrag (Fake-Antworten per page.route, nie ein echter Provider).
// VOI-16: KI-Knöpfe sind ausgeblendet bei Opt-in aus und deaktiviert offline.
import { test, expect, type Page, type Route } from '@playwright/test';
import { addVirtualAuthenticator, go, onboardWithCloud, onboardWithPassword, uniqueUser } from './helpers';

const STATUS = { provider: 'anthropic', model: 'claude-opus-5-5', thirdParty: true, dailyTokens: 50_000, usedTokens: 0 };
const MARKER = 'STB-KI-MARKER-Klartext';
const TEXT = `Seit gestern starker Kopfschmerz ${MARKER}`;

interface FillRequest { templateName: string; text: string; version: { blocks: { id: string; label: string }[] } }

/** Fake-Server für /api/v1/llm: `answer` bekommt die Anfrage und liefert Status und Body der Fill-Antwort. */
async function mockLlm(page: Page, answer: (req: FillRequest) => { status?: number; body: unknown }) {
  const requests: FillRequest[] = [];
  await page.route('**/api/v1/llm/status', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATUS) }));
  await page.route('**/api/v1/llm/fill', (r: Route) => {
    const req = r.request().postDataJSON() as FillRequest;
    requests.push(req);
    const a = answer(req);
    return r.fulfill({ status: a.status ?? 200, contentType: 'application/json', body: JSON.stringify(a.body) });
  });
  return requests;
}

const idOf = (req: FillRequest, label: string) => req.version.blocks.find((b) => b.label.startsWith(label))!.id;

async function cloudWithOptIn(page: Page, optIn = true) {
  await addVirtualAuthenticator(page);
  await onboardWithCloud(page, uniqueUser('ki'));
  if (optIn) await page.evaluate(() => localStorage.setItem('stb-v3-llm', '1'));
}

async function fillViaDialog(page: Page, text = TEXT) {
  await page.getByTestId('llm-fill-open').click();
  await page.getByLabel('Dein Text').fill(text);
  await page.getByRole('button', { name: 'Weiter' }).click();
}

/** Gesamter Inhalt aller IndexedDB-Datenbanken als Text (zum Prüfen, dass der KI-Text nie gespeichert wird). */
async function dumpIndexedDb(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const info of await indexedDB.databases()) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open(info.name!);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((resolve) => {
          const all = db.transaction(store).objectStore(store).getAll();
          all.onsuccess = () => resolve(all.result);
        });
        out.push(JSON.stringify(rows));
      }
      db.close();
    }
    return out.join('\n');
  });
}

test.describe('Aus Text ausfüllen', () => {
  test.describe.configure({ timeout: 150_000 });

  test('VOI-14: Freigabe zeigt Text und Empfänger, Entwurf füllt markierte Felder, ungültige Werte werden verworfen, gespeichert wird nur durch den Nutzer', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    const requests = await mockLlm(page, (req) => ({ body: { values: { [idOf(req, 'Schmerzstärke')]: 7, [idOf(req, 'Schmerzlokalisation')]: 'Kopf', erfunden: 'x' } } }));
    await cloudWithOptIn(page);
    await go(page, '/entry/new');

    await fillViaDialog(page);
    const consent = page.getByRole('dialog');
    await expect(consent.getByTestId('llm-consent-text')).toHaveText(TEXT);
    await expect(consent.getByTestId('llm-consent-recipient')).toHaveText('Anthropic (Drittanbieter, USA)');
    expect(requests).toHaveLength(0); // vor „Senden“ geht nichts raus
    await consent.getByRole('button', { name: 'Senden' }).click();

    const notice = page.getByTestId('llm-draft-notice');
    await expect(notice).toContainText('1 Feld wurde ausgefüllt');
    await expect(notice.getByTestId('llm-rejected')).toContainText('Schmerzlokalisation');
    await expect(page.getByLabel(/Schmerzstärke/)).toHaveValue('7');
    await expect(page.locator('[data-llm-changed]')).toHaveCount(1);
    await expect(page.locator('[data-llm-changed]')).toContainText('Von der KI ausgefüllt');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.text).toBe(TEXT);

    // Der Nutzer entscheidet: Eintrag ist erst nach „Speichern“ da; der KI-Text steht nirgends in IndexedDB.
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByTestId('entry-time')).toBeVisible();
    expect(await dumpIndexedDb(page)).not.toContain(MARKER);
  });

  test('VOI-14: Abbrechen in der Freigabe sendet nichts; Serverfehler erscheinen im Dialog, der Entwurf bleibt unverändert', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    const requests = await mockLlm(page, () => ({ status: 429, body: { error: 'llm_budget_exhausted' } }));
    await cloudWithOptIn(page);
    await go(page, '/entry/new');

    await fillViaDialog(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
    expect(requests).toHaveLength(0);

    await fillViaDialog(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Senden' }).click();
    await expect(page.getByTestId('llm-consent-error')).toContainText('Tageskontingent');
    expect(requests).toHaveLength(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByTestId('llm-draft-notice')).toHaveCount(0);
    await expect(page.locator('[data-llm-changed]')).toHaveCount(0);
  });

  test('VOI-14: Schnelleintrag füllt die Schnellfelder aus dem Text und speichert erst auf Tipp', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await mockLlm(page, (req) => ({ body: { values: { [idOf(req, 'Schmerzstärke')]: 4 } } }));
    await cloudWithOptIn(page);
    await go(page, '/quick');

    await fillViaDialog(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Senden' }).click();
    await expect(page.getByLabel(/Schmerzstärke/)).toHaveValue('4');
    await expect(page.getByTestId('llm-draft-notice')).toBeVisible();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('entry-row')).toHaveCount(1);
    expect(await dumpIndexedDb(page)).not.toContain(MARKER);
  });

  test('VOI-16: ohne Opt-in sind die KI-Knöpfe in Formular und Schnelleintrag ausgeblendet, offline deaktiviert', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Konto mit virtuellem Authenticator (Chromium)');
    await mockLlm(page, () => ({ body: { values: {} } }));
    await cloudWithOptIn(page, false);
    await go(page, '/entry/new');
    await expect(page.getByLabel('Zeitpunkt')).toBeVisible();
    await expect(page.getByTestId('llm-fill-open')).toHaveCount(0);
    await go(page, '/quick');
    await expect(page.getByLabel(/Schmerzstärke/)).toBeVisible();
    await expect(page.getByTestId('llm-fill-open')).toHaveCount(0);

    await page.evaluate(() => localStorage.setItem('stb-v3-llm', '1'));
    await go(page, '/entry/new');
    await expect(page.getByTestId('llm-fill-open')).toBeEnabled();
    await page.context().setOffline(true);
    await expect(page.getByTestId('llm-fill-open')).toBeDisabled();
    await expect(page.getByText('Offline sind die KI-Funktionen nicht verfügbar.')).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByTestId('llm-fill-open')).toBeEnabled();
  });

  test('VOI-16: ohne Konto gibt es keinen KI-Knopf, auch bei gesetztem Opt-in', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => r.url().includes('/api/v1/llm') && calls.push(r.url()));
    await page.addInitScript(() => localStorage.setItem('stb-v3-llm', '1'));
    await onboardWithPassword(page);
    await go(page, '/entry/new');
    await expect(page.getByLabel('Zeitpunkt')).toBeVisible();
    await expect(page.getByTestId('llm-fill-open')).toHaveCount(0);
    expect(calls).toEqual([]);
  });
});
