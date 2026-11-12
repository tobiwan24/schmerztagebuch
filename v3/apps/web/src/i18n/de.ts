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
  notFound: {
    title: 'Seite nicht gefunden',
    toStart: 'Zur Startseite',
  },
} as const;

export type Messages = typeof de;
