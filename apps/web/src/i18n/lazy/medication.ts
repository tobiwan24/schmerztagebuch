// UI-Texte „medication“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deMedication = {
  add: 'Medikament hinzufügen',
  addFree: '+ Medikament',
  addPreset: (name: string) => `+ ${name}`,
  itemTitle: (n: number, name: string) => `Medikament ${n}: ${name}`,
  defaultName: 'Neues Medikament', name: 'Name', dose: 'Dosis', unit: 'Einheit', time: 'Uhrzeit', effect: 'Wirkung (0–10)', noEffect: 'ohne Angabe',
  remove: (name: string) => `${name} entfernen`, max: 'Mehr als 20 Medikamente sind nicht möglich.',
  presetsGroup: 'Aus den Vorgaben',
} as const;
