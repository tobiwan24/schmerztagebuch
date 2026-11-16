// Neuigkeiten je Version (UI-26, A-081). Neueste zuerst. Pro Version Datum und 1–6 Punkte, für Nutzer formuliert.
// Jede Version, die `APP_VERSION` wird, braucht hier einen Eintrag (Test whats-new.test.ts).
import type { Release } from './whats-new.js';

export const changelog: readonly Release[] = [
  {
    version: '3.1.0-alpha.1',
    date: '2026-11-16',
    points: [
      'Neu: „Neu in Version x“ zeigt nach einem Update, was sich geändert hat; alle Neuigkeiten stehen unter Mehr → Einstellungen → Über.',
      'Neu: Kurzanleitung beim ersten Besuch von Start, Eintrag, Verlauf, Auswertung und Vorlagen-Editor. Sie lässt sich überspringen und in den Einstellungen wieder einschalten.',
    ],
  },
  {
    version: '3.0.0-alpha.1',
    date: '2026-11-16',
    points: [
      'Komplett neu aufgebaute App: schneller, mit Ende-zu-Ende-Verschlüsselung und Synchronisation zwischen Geräten.',
      'Eigener Vorlagen-Editor, Schnelleintrag, Wetter, Körperkarte und Tags.',
      'Verlauf mit Filtern, Auswertung mit Diagrammen und PDF-Export für den Arzttermin.',
      'Tagebücher teilen, Kurzbefehl-Eingabe und automatische Sicherung.',
    ],
  },
];
