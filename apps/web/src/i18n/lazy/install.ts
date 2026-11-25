// UI-Texte „install“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deInstall = {
  title: 'App installieren',
  hint: 'Für Offline-Nutzung und Erinnerungen: in Safari „Teilen“ → „Zum Home-Bildschirm“.',
  safariHint: 'Dieser Browser kann die App nicht installieren — nur Safari kann das. Ohne Installation kann iOS die gespeicherten Daten nach einiger Zeit löschen.',
  dismiss: 'Hinweis schließen',
  persistTitle: 'Dauerhafter Speicher',
  persistGranted: 'Gewährt — der Browser löscht die Daten nicht von sich aus.',
  persistDenied: 'Nicht gewährt — der Browser kann Daten bei Speicherknappheit löschen. Sichere regelmäßig ein Backup.',
  persistUnknown: 'Dieser Browser gibt keine Auskunft.',
} as const;
