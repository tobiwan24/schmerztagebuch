// UI-Texte „whatsNew“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deWhatsNew = {
  title: (version: string) => `Neu in Version ${version}`,
  close: 'Verstanden',
  heading: 'Neuigkeiten',
  empty: 'Noch keine Einträge.',
} as const;
