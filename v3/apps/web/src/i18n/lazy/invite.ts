// UI-Texte „invite“ — eigenes Modul, wird nur mit den Seiten geladen, die es brauchen (Bundle-Budget QA-02).
export const deInvite = {
  title: 'Einladung',
  invalid: 'Dieser Einladungslink ist unvollständig.',
  gone: 'Diese Einladung ist abgelaufen, widerrufen oder schon angenommen.',
  details: (inviter: string, role: string) => `${inviter} lädt dich ein — Rolle: ${role}`,
  roles: { editor: 'Darf eintragen', viewer: 'Darf lesen' },
  needsAccount: 'Zum Annehmen brauchst du ein Konto („Mit Konto").',
  accept: 'Einladung annehmen',
  accepted: 'Angenommen. Sobald die einladende Person die App öffnet, wird das Tagebuch für dich freigeschaltet.',
  error: 'Annehmen fehlgeschlagen. Bitte versuche es erneut.',
} as const;
