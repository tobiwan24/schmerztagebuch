// Alle UI-Texte (Spec 10). Eine Datei, vorbereitet für weitere Sprachen: Schlüssel bleiben, Werte werden übersetzt.
export const de = {
  app: {
    name: 'Schmerztagebuch',
    loading: 'Wird geladen …',
  },
  nav: {
    label: 'Hauptnavigation',
    start: 'Start',
    history: 'Verlauf',
    analysis: 'Auswertung',
    more: 'Mehr',
    back: 'Zurück',
  },
  start: {
    title: 'Start',
    quickEntry: 'Schnell eintragen',
    newEntry: 'Neuer Eintrag',
    emptyTitle: 'Noch keine Einträge',
    emptyHint: 'Tippe auf „Schnell eintragen“ oder „Neuer Eintrag“, um deinen ersten Eintrag zu erfassen.',
  },
  history: {
    title: 'Verlauf',
    emptyTitle: 'Noch nichts im Verlauf',
    emptyHint: 'Einträge erscheinen hier, nach Tagen gruppiert.',
  },
  analysis: {
    title: 'Auswertung',
    emptyTitle: 'Noch keine Daten für eine Auswertung',
    emptyHint: 'Sobald es Einträge gibt, siehst du hier Verlauf, Kalender und Vergleiche.',
  },
  more: {
    title: 'Mehr',
    templates: 'Vorlagen',
    diaries: 'Tagebücher',
    export: 'Export & Backup',
    settings: 'Einstellungen',
  },
  settings: {
    title: 'Einstellungen',
    appearance: 'Darstellung',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    themeSystem: 'Automatisch',
  },
  entry: {
    title: 'Eintrag',
    newTitle: 'Neuer Eintrag',
  },
  quick: { title: 'Schnelleintrag' },
  invite: { title: 'Einladung' },
  state: {
    errorTitle: 'Das hat nicht geklappt',
    errorHint: 'Die Daten konnten nicht geladen werden.',
    retry: 'Erneut versuchen',
  },
  authErrors: {
    'webauthn-cancelled': { title: 'Anmeldung abgebrochen', action: 'Tippe erneut auf „Entsperren“, wenn du bereit bist.' },
    'webauthn-not-allowed': { title: 'Face ID wurde nicht gestartet', action: 'Tippe direkt auf „Entsperren“ — die Anfrage muss aus einem Tipp kommen.' },
    'prf-unsupported': { title: 'Dieser Passkey unterstützt keine Verschlüsselung', action: 'Nutze einen aktuellen iPhone- oder Android-Passkey oder deinen Backup-Code.' },
    'no-credential': { title: 'Kein passender Passkey gefunden', action: 'Melde dich mit deinem Backup-Code an und lege danach einen neuen Passkey an.' },
    'server-unreachable': { title: 'Server nicht erreichbar', action: 'Prüfe deine Verbindung und versuche es gleich noch einmal.' },
    'challenge-expired': { title: 'Die Anmeldung ist abgelaufen', action: 'Starte die Anmeldung neu — sie gilt fünf Minuten.' },
    'wrong-backup-code': { title: 'Backup-Code stimmt nicht', action: 'Prüfe die Zeichen; Leerzeichen und Groß-/Kleinschreibung sind egal.' },
    'wrong-password': { title: 'Passwort stimmt nicht', action: 'Gib dein Passwort erneut ein oder nutze den Backup-Code.' },
    'unwrap-failed': { title: 'Schlüssel konnte nicht geöffnet werden', action: 'Entsperre mit einem anderen Faktor (Passkey oder Backup-Code).' },
  },
  notFound: {
    title: 'Seite nicht gefunden',
    toStart: 'Zur Startseite',
  },
} as const;

export type Messages = typeof de;
