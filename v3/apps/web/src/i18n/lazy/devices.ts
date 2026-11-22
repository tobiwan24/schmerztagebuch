// UI-Texte „devices“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deDevices = {
  title: 'Geräte',
  hint: 'Diese Geräte sind mit deinem Konto angemeldet.',
  thisDevice: 'Dieses Gerät',
  unnamed: 'Gerät',
  added: (date: string) => `angemeldet am ${date}`,
  revoked: 'gesperrt',
  revoke: 'Sperren',
  revokeConfirm: 'Gerät jetzt sperren',
  revokeHint: 'Das Gerät verliert sofort den Zugriff auf den Server. Seine lokalen Daten bleiben dort bis zum Löschen. Deine eigenen Tagebücher werden danach mit einem neuen Schlüssel neu verschlüsselt.',
  rotating: 'Die Schlüssel deiner Tagebücher werden erneuert …',
  signOut: 'Auf diesem Gerät abmelden',
  signOutConfirm: 'Jetzt abmelden',
  signOutHint: 'Schlüssel und Zugang werden von diesem Gerät entfernt. Deine Einträge bleiben auf dem Gerät, bis du sie löschst.',
  failed: 'Die Geräte konnten nicht geladen werden. Prüfe deine Verbindung.',
} as const;
