// UI-Texte „reminders“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deReminders = {
  title: 'Erinnerungen',
  hint: 'Tägliche Erinnerung an deinen Eintrag. Erscheint, solange die App geöffnet oder im Hintergrund ist; verpasste Erinnerungen beim nächsten Öffnen.',
  enabled: 'Erinnerung aktiv',
  time: 'Uhrzeit',
  days: 'Wochentage',
  dayNames: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  denied: 'Benachrichtigungen sind für diese App blockiert. Erlaube sie in den Einstellungen des Geräts.',
  unsupported: 'Dieser Browser unterstützt keine Benachrichtigungen (auf dem iPhone: App zum Home-Bildschirm hinzufügen).',
  training: {
    title: 'Erinnerung „Übungen“',
    hint: 'Eigene Erinnerung an deine Übungen, unabhängig von der Eintrags-Erinnerung. Gleiche Regeln: Sie erscheint, solange die App geöffnet oder im Hintergrund ist.',
    enabled: 'Übungs-Erinnerung aktiv',
  },
} as const;
