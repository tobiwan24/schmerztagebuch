// UI-Texte „authErrors“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deAuthErrors = {
  'webauthn-cancelled': { title: 'Anmeldung abgebrochen', action: 'Tippe erneut auf „Entsperren“, wenn du bereit bist.' },
  'webauthn-not-allowed': { title: 'Face ID wurde nicht gestartet', action: 'Tippe direkt auf „Entsperren“ — die Anfrage muss aus einem Tipp kommen.' },
  'prf-unsupported': { title: 'Dieser Passkey unterstützt keine Verschlüsselung', action: 'Nutze einen aktuellen iPhone- oder Android-Passkey oder deinen Backup-Code.' },
  'no-credential': { title: 'Kein passender Passkey gefunden', action: 'Melde dich mit deinem Backup-Code an und lege danach einen neuen Passkey an.' },
  'server-unreachable': { title: 'Server nicht erreichbar', action: 'Prüfe deine Verbindung und versuche es gleich noch einmal.' },
  'challenge-expired': { title: 'Die Anmeldung ist abgelaufen', action: 'Starte die Anmeldung neu — sie gilt fünf Minuten.' },
  'wrong-backup-code': { title: 'Backup-Code stimmt nicht', action: 'Prüfe die Zeichen; Leerzeichen und Groß-/Kleinschreibung sind egal.' },
  'wrong-password': { title: 'Passwort stimmt nicht', action: 'Gib dein Passwort erneut ein oder nutze den Backup-Code.' },
  'unwrap-failed': { title: 'Schlüssel konnte nicht geöffnet werden', action: 'Entsperre mit einem anderen Faktor (Passkey oder Backup-Code).' },
} as const;
