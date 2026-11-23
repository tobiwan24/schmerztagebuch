import { describe, expect, it } from 'vitest';
import { deviceLabel } from './device-name';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  ipadFirefox: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0',
};

describe('deviceLabel', () => {
  it('RDM-028 P7: Gerätenamen lesbar', () => {
    expect(deviceLabel(UA.iphoneSafari)).toBe('iPhone · Safari');
    expect(deviceLabel(UA.iphoneChrome)).toBe('iPhone · Chrome');
    expect(deviceLabel(UA.winChrome)).toBe('Windows · Chrome');
    expect(deviceLabel(UA.winEdge)).toBe('Windows · Edge');
    expect(deviceLabel(UA.winFirefox)).toBe('Windows · Firefox');
    expect(deviceLabel(UA.macSafari)).toBe('Mac · Safari');
    expect(deviceLabel(UA.androidChrome)).toBe('Android · Chrome');
    expect(deviceLabel(UA.samsung)).toBe('Android · Samsung Internet');
    expect(deviceLabel(UA.linuxFirefox)).toBe('Linux · Firefox');
    expect(deviceLabel(UA.ipadFirefox)).toBe('iPad · Firefox');
    expect(deviceLabel(UA.opera)).toBe('Windows · Opera');
  });

  it('RDM-028 P7: Gerätenamen lesbar — freie Namen bleiben, null wird „unbenannt“', () => {
    expect(deviceLabel('Mein Tablet')).toBe('Mein Tablet');
    expect(deviceLabel(null, 'Gerät')).toBe('Gerät');
    expect(deviceLabel('')).toBe('Gerät');
  });
});
