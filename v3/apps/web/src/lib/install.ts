// Installationskontext (UI-19): läuft die App im Browser, installiert (Standalone) oder unter iOS in einem Browser,
// der nicht installieren kann? Rein, damit die Erkennung ohne Gerät testbar ist.
export type InstallContext = 'standalone' | 'browser' | 'ios-other-browser';

export interface InstallEnv {
  standalone: boolean;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

const IOS_OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Brave/i;

export function installContext(env: InstallEnv): InstallContext {
  if (env.standalone) return 'standalone';
  // iPadOS meldet sich als Mac mit Touch
  const ios = /iPhone|iPad|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
  return ios && IOS_OTHER_BROWSERS.test(env.userAgent) ? 'ios-other-browser' : 'browser';
}

export function currentInstallEnv(): InstallEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    standalone: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
  };
}

/** Dauerhaften Speicher anfordern (UI-16); `null`, wenn der Browser das nicht kann. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persist?.()) ?? null;
  } catch {
    return null;
  }
}
