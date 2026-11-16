// Neuigkeiten je Version (UI-26, A-081). Neueste zuerst. Pro Version Datum und 1–6 Punkte, für Nutzer formuliert.
// Jede Version, die `APP_VERSION` wird, braucht hier einen Eintrag (Test whats-new.test.ts).
import type { Release } from './whats-new.js';

export const changelog: readonly Release[] = [
  {
    version: '3.3.0-alpha.1',
    date: '2026-11-16',
    points: [
      'Neu: Übungen. Im Vorlagen-Editor markierst du eine Vorlage als Trainingsvorlage und legst Übungen mit Sätzen, Wiederholungen, Dauer, Ablauf, Video-Link und Stufen an.',
      'Neu: Auf Start führt die Kachel „Übungen“ Schritt für Schritt durch dein Training, mit Timer, Stufe und Schmerz bei der Übung. Das Ergebnis ist ein normaler Eintrag im Verlauf.',
      'Neu: Trainingsvorlagen können an Funktionsphasen gebunden sein und erscheinen dann nur in diesen Phasen.',
      'Neu: Auswertung → Übungen zeigt Trainingstage je Woche und den Verlauf der Stufen.',
      'Neu: Eine eigene Erinnerung für Übungen mit eigener Uhrzeit und eigenen Tagen (Einstellungen → Erinnerungen).',
    ],
  },
  {
    version: '3.2.0-alpha.1',
    date: '2026-11-16',
    points: [
      'Neu: Medikamente erfassen mit Name, Dosis, Einheit, Uhrzeit und Wirkung. Im Vorlagen-Editor legst du Vorgaben an, im Formular und im Schnelleintrag tippst du sie nur an.',
      'Neu: Die Vorlage „Schmerztagebuch mit Medikamenten“ ist im Katalog.',
      'Neu: Auswertung → Häufigkeiten zeigt ein Kreisdiagramm mit dem Anteil je Medikament.',
      'Medikamente erscheinen in Suche, Filter, Medikamententagen, CSV, JSON und PDF-Bericht.',
    ],
  },
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
