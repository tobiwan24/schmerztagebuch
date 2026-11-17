// UI-Texte „updates“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deUpdates = {
  title: 'Updates',
  modeLabel: 'Neue Versionen',
  modeAuto: 'Selbstständig',
  modeNotify: 'Nur Hinweis',
  modeAutoHint: 'Eine neue Version wird aktiv, sobald du die App verlässt oder neu startest.',
  modeNotifyHint: 'Du bekommst einen Hinweis und startest selbst neu.',
  check: 'Nach Updates suchen',
  checking: 'Suche …',
  current: 'Die App ist auf dem neuesten Stand.',
  availableHint: 'Eine neue Version ist bereit — siehe Hinweis oben.',
  unsupported: 'Die Suche ist hier nicht möglich (kein Service Worker oder offline).',
} as const;
