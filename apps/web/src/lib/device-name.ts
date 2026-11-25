// Lesbarer Gerätename aus der Browserkennung (RDM-028 P7, G5). Reine Anzeige; gespeichert bleibt der Rohwert.
const looksLikeUserAgent = (s: string) => /^Mozilla\/|AppleWebKit|Gecko\/|Opera\//.test(s);

function osOf(ua: string): string | null {
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac'; // iPadOS meldet sich als „Macintosh“ (nicht unterscheidbar)
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux|X11/.test(ua)) return 'Linux';
  return null;
}

function browserOf(ua: string): string | null {
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Edg\/|EdgA\/|EdgiOS\/|Edge\//.test(ua)) return 'Edge';
  if (/OPR\/|Opera|OPiOS/.test(ua)) return 'Opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'Firefox';
  if (/Chrome\/|CriOS\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua)) return 'Safari'; // Home-Bildschirm-PWA: iOS-UA ohne Browser-Token
  return null;
}

export function deviceLabel(name: string | null, unnamed = 'Gerät'): string {
  if (!name) return unnamed;
  if (!looksLikeUserAgent(name)) return name;
  const os = osOf(name);
  const browser = browserOf(name);
  if (os && browser) return `${os} · ${browser}`;
  return os ?? browser ?? name;
}
