// src/utils/persistentStorage.ts
// Utility-Funktionen für Storage Manager API, PWA-Status und iOS-Detection

export function isStorageManagerSupported(): boolean {
  return 'storage' in navigator && 'persist' in navigator.storage;
}

export function isPWAInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches;
}

export function isIOSNonSafari(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  return isIOS && !isSafari;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!isStorageManagerSupported()) return false;
  try {
    const granted = await navigator.storage.persist();
    console.log(`Persistent Storage: ${granted ? '✅ Granted' : '❌ Denied'}`);
    return granted;
  } catch {
    return false;
  }
}

export async function isPersistentStorageGranted(): Promise<boolean> {
  if (!isStorageManagerSupported()) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function getStorageEstimate(): Promise<{
  quota: number;
  usage: number;
  percentUsed: number;
} | null> {
  if (!isStorageManagerSupported()) return null;
  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    return { quota, usage, percentUsed: quota ? (usage / quota) * 100 : 0 };
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / Math.pow(k, i)) * 100) / 100} ${sizes[i]}`;
}
