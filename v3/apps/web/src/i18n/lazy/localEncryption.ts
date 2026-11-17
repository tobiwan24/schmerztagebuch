// UI-Texte „localEncryption“ — eigenes Modul, nur mit den Einstellungen geladen (Bundle-Budget QA-02).
export const deLocalEncryption = {
  heading: 'Daten auf dem Gerät',
  intro: 'Deine Einträge liegen auf diesem Gerät standardmäßig unverschlüsselt. Mit dieser Einstellung werden sie zusätzlich auf dem Gerät verschlüsselt.',
  label: 'Daten auf dem Gerät verschlüsseln',
  hint: 'Schützt vor dem Auslesen des Gerätespeichers ohne Entsperren. Es ändert nichts an der Synchronisierung.',
  dialogTitle: 'Daten auf dem Gerät verschlüsseln?',
  dialogBody: [
    'Alle vorhandenen Einträge werden im Hintergrund verschlüsselt. Das kann bei vielen Einträgen etwas dauern; die App bleibt dabei benutzbar.',
    'Das Einschalten ist endgültig: Die Einstellung lässt sich später nicht wieder ausschalten.',
    'Ohne Entsperren sind die Daten danach nicht lesbar. Bewahre deinen Backup-Code gut auf — er bleibt der Weg zurück, wenn du dein Passwort oder deinen Passkey verlierst.',
  ],
  cancel: 'Abbrechen',
  confirm: 'Verschlüsseln und einschalten',
  on: 'Eingeschaltet — diese Einstellung bleibt dauerhaft an.',
  running: (done: number, total: number) => `Verschlüssele … ${done} von ${total} Einträgen`,
  progressLabel: 'Fortschritt der Verschlüsselung',
  done: 'Alle Daten auf diesem Gerät sind verschlüsselt.',
  pending: (n: number) => `Noch ${n} Einträge sind nicht verschlüsselt. Die Umstellung wird nach dem nächsten Entsperren fortgesetzt.`,
  failed: (n: number) => `${n} Einträge konnten noch nicht umgestellt werden (Schlüssel fehlt). Der nächste Versuch läuft nach dem Entsperren.`,
} as const;
