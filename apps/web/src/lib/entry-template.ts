// Vorlagen, mit denen Einträge angelegt werden: aktiv und keine Übung (Start-Kacheln, Schnell-Buttons, Tagebuch-Einstellungen).
export const isEntryTemplate = (t: { archived?: boolean; purpose?: string }): boolean => !t.archived && t.purpose !== 'training';
