// UI-Texte „danger“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deDanger = {
  title: 'Gefahr-Zone',
  hint: 'Löscht alle Einträge, Vorlagen, Schlüssel und die Auto-Sicherung auf diesem Gerät. Eine Datei-Sicherung (Backup) bleibt unberührt.',
  serverStays: 'Daten auf dem Server bleiben erhalten; du kannst dich später wieder anmelden.',
  start: 'Alle Daten auf diesem Gerät löschen',
  typeWord: (word: string) => `Zur Bestätigung „${word}“ eingeben`,
  confirm: 'Endgültig löschen',
  cancel: 'Abbrechen',
  failed: 'Das Löschen ist fehlgeschlagen. Schließe andere Tabs der App und versuche es erneut.',
} as const;
