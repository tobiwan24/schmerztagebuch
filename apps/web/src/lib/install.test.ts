import { describe, expect, it } from 'vitest';
import { installContext } from './install';

const base = { standalone: false, platform: 'iPhone', maxTouchPoints: 5 };
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const IPAD_FIREFOX = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15';

describe('Installationskontext', () => {
  it('installierte App ist Standalone, auch unter iOS', () => {
    expect(installContext({ ...base, standalone: true, userAgent: SAFARI })).toBe('standalone');
  });
  it('Safari und Desktop-Browser sind browser', () => {
    expect(installContext({ ...base, userAgent: SAFARI })).toBe('browser');
    expect(installContext({ standalone: false, platform: 'Win32', maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' })).toBe('browser');
  });
  it('iOS in Chrome oder Firefox ist ios-other-browser, iPadOS als Mac mit Touch ebenso', () => {
    expect(installContext({ ...base, userAgent: CHROME_IOS })).toBe('ios-other-browser');
    expect(installContext({ standalone: false, platform: 'MacIntel', maxTouchPoints: 5, userAgent: IPAD_FIREFOX })).toBe('ios-other-browser');
  });
});
