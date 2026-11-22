import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { go, onboardWithPassword } from './helpers';

/** Hauptansichten (Spec 10) — nach dem Onboarding mit einem Eintrag, damit Listen/Detail/Auswertung Inhalt haben. */
const VIEWS = ['/', '/history', '/analysis', '/entry/new', '/quick', '/more', '/more/templates', '/more/export', '/more/settings', '/more/settings/diagnose', '/migrate'];

async function seriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  // Plausibilität: axe hat tatsächlich Regeln geprüft (u. a. Kontrast, Namen von Bedienelementen)
  expect(r.passes.map((p) => p.id)).toContain('color-contrast');
  expect(r.passes.length).toBeGreaterThan(10);
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('Barrierefreiheit', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const theme of ['light', 'dark'] as const) {
    test(`UI-02: axe-core meldet auf allen Hauptansichten keine Verstöße „serious"/„critical" (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('stb-theme', t), theme);
      await onboardWithPassword(page);
      await go(page, '/entry/new');
      await page.getByLabel(/Schmerzstärke/).fill('6');
      await page.getByLabel('Notizen').fill('Testeintrag');
      await page.getByRole('button', { name: 'Speichern' }).click();
      await expect(page.getByTestId('entry-time')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');

      const found: Record<string, string[]> = {};
      // Detailansicht des Eintrags
      const detail = await seriousViolations(page);
      if (detail.length) found['/entry/:id'] = detail;
      for (const path of VIEWS) {
        await go(page, path);
        await page.waitForTimeout(400); // Worker-Daten/Charts
        const v = await seriousViolations(page);
        if (v.length) found[path] = v;
      }
      expect(found).toEqual({});
    });
  }
});
