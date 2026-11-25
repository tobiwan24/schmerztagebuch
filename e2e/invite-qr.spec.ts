// RDM-032 (A-148): Einladung per QR-Code zwischen zwei Konten. Der QR-Code wird aus dem Screenshot gelesen (wie eine
// Kamera ihn sehen würde); die eingeladene Person löst ihn im Scanner-Dialog über den Ersatzweg „Code einfügen“ ein.
import { test, expect, type Locator } from '@playwright/test';
import { decode as decodePng } from 'fast-png';
import jsQR from 'jsqr';
import { addVirtualAuthenticator, go, onboardWithCloud, openMembers, uniqueUser } from './helpers';

/** QR-Code aus einem Element-Screenshot lesen. */
async function readQr(el: Locator): Promise<string> {
  const png = decodePng(await el.screenshot());
  const rgba = new Uint8ClampedArray(png.width * png.height * 4);
  const ch = png.channels;
  for (let i = 0; i < png.width * png.height; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Number(png.data[i * ch + (ch >= 3 ? c : 0)]);
    rgba[i * 4 + 3] = 255;
  }
  const found = jsQR(rgba, png.width, png.height);
  if (!found) throw new Error('QR-Code nicht lesbar');
  return found.data;
}

test.describe('Einladung per QR-Code', () => {
  test.describe.configure({ timeout: 150_000 });

  test('SHR-19: QR-Code zeigen, in der App einlösen, Beitritt im Dialog; Schließen widerruft die Einladung', async ({ page: a, browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'zwei Konten mit virtuellem Authenticator (Chromium)');
    const ownerName = uniqueUser('owner');
    const memberName = uniqueUser('member');
    await addVirtualAuthenticator(a);
    await onboardWithCloud(a, ownerName);

    // Owner: QR-Code anzeigen
    await openMembers(a);
    await a.getByRole('button', { name: 'Darf lesen' }).click();
    await a.getByTestId('invite-qr-open').click();
    const qr = a.getByTestId('invite-qr');
    await expect(qr).toBeVisible();
    const code = await readQr(qr);
    expect(code).toMatch(/^[A-Za-z0-9-]+\.[A-Za-z0-9_-]{16,64}$/);

    // Eingeladene Person: Mehr → Tagebücher → Einladung scannen → Code einfügen → Einladungsseite
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'de-DE' });
    const b = await ctx.newPage();
    await addVirtualAuthenticator(b);
    await onboardWithCloud(b, memberName);
    await go(b, '/more/diaries');
    await b.getByTestId('invite-scan-open').click();
    await expect(b.getByTestId('invite-scan-dialog')).toBeVisible();
    await b.getByTestId('invite-code-input').fill('kein-code');
    await b.getByTestId('invite-code-submit').click();
    await expect(b.getByText('Das ist kein gültiger Einladungscode.')).toBeVisible();
    await b.getByTestId('invite-code-input').fill(code);
    await b.getByTestId('invite-code-submit').click();
    await expect(b.getByTestId('invite-details')).toContainText(`${ownerName} lädt dich ein — Rolle: Darf lesen`);
    await b.getByRole('button', { name: 'Einladung annehmen' }).click();
    await expect(b.getByTestId('invite-accepted')).toBeVisible();

    // Owner: Dialog meldet den Beitritt (Abfrage + sofortiger Sync bestätigt)
    await expect(a.getByTestId('invite-qr-joined')).toContainText(`${memberName} ist dem Tagebuch beigetreten.`, { timeout: 45_000 });
    await a.getByRole('button', { name: 'Fertig' }).click();
    await expect(a.getByTestId('invite-qr-dialog')).toHaveCount(0);
    await expect(a.getByTestId('member')).toHaveCount(2);

    // Neuer QR-Code, Dialog schließen → Einladung widerrufen (Server: 410)
    await a.getByTestId('invite-qr-open').click();
    const second = await readQr(a.getByTestId('invite-qr'));
    expect(second).not.toBe(code);
    await a.getByRole('button', { name: 'Schließen' }).click();
    await expect(a.getByTestId('invite-qr-dialog')).toHaveCount(0);
    const id = second.split('.')[0]!;
    await expect.poll(async () => (await a.request.get(`/api/v1/invitations/${id}`)).status(), { timeout: 15_000 }).toBe(410);
    await ctx.close();
  });
});
