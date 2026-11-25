import { test, expect } from '@playwright/test';
import { onboardWithPassword } from './helpers';

test.describe('Sicherheit', () => {
  test('QA-04: CSP-Header sind gesetzt; ein eingeschleustes Inline-Skript wird blockiert (Konsolen-CSP-Verletzung)', async ({ page }) => {
    const consoleCsp: string[] = [];
    page.on('console', (m) => /Content Security Policy|Refused to execute/i.test(m.text()) && consoleCsp.push(m.text()));
    const res = await page.goto('/');
    const csp = res!.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(res!.headers()['x-content-type-options']).toBe('nosniff');
    await onboardWithPassword(page);

    const violation = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          document.addEventListener('securitypolicyviolation', (e) => resolve(e.violatedDirective), { once: true });
          const s = document.createElement('script');
          s.textContent = 'window.__stbInjected = 1';
          document.body.appendChild(s);
          setTimeout(() => resolve('keine'), 3000);
        }),
    );
    expect(violation).toMatch(/^script-src/);
    expect(await page.evaluate(() => (window as unknown as { __stbInjected?: number }).__stbInjected)).toBeUndefined();
    await expect.poll(() => consoleCsp.length).toBeGreaterThan(0);
  });
});
