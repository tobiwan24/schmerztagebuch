// Alle UI-Texte (Spec 10). Eine Datei, vorbereitet für weitere Sprachen: Schlüssel bleiben, Werte werden übersetzt.
export const de = {
  app: {
    name: 'Schmerztagebuch',
    loading: 'Wird geladen …',
  },
  nav: {
    start: 'Start',
    history: 'Verlauf',
    analysis: 'Auswertung',
    more: 'Mehr',
  },
} as const;

export type Messages = typeof de;
