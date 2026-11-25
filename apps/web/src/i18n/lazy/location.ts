// UI-Texte „location“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deLocation = {
  searchLabel: 'Ort suchen',
  searchHint: 'Nur der eingegebene Ortsname wird an Open-Meteo gesendet.',
  searching: 'Sucht …',
  noHits: 'Kein Ort gefunden.',
  searchError: 'Die Ortssuche ist gerade nicht erreichbar. Es wurde nichts gespeichert.',
  useCurrent: 'Aktuellen Standort übernehmen',
  locating: 'Standort wird bestimmt …',
  locateError: 'Der Standort konnte nicht bestimmt werden. Es wurde nichts gespeichert.',
  current: 'Aktueller Ort',
  hits: 'Treffer',
  remove: 'Ort entfernen',
  currentLabel: 'Aktueller Standort',
} as const;
