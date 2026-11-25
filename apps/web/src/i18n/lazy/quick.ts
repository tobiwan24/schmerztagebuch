// UI-Texte „quick“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deQuick = {
  title: 'Schnelleintrag',
  now: (template: string) => `jetzt · ${template}`,
  moreFields: 'Mehr Felder …',
  emptyHint: 'Gib mindestens einen Wert ein.',
  noBlocksTitle: 'Kein Feld für den Schnelleintrag',
  noBlocksHint: 'Die Vorlage hat keinen Slider. Lege einen Eintrag über das vollständige Formular an.',
  chooseDiary: 'Für welches Tagebuch?',
  template: 'Vorlage',
} as const;
