// Neuigkeiten je Version (UI-26, A-081). Neueste zuerst. Pro Version Datum und 1–6 Punkte, für Nutzer formuliert.
// Jede Version, die `APP_VERSION` wird, braucht hier einen Eintrag (Test whats-new.test.ts).
import type { Release } from './whats-new.js';

export const changelog: readonly Release[] = [
  {
    version: '3.6.0-alpha.1',
    date: '2026-11-17',
    points: [
      'Neu: Auswertung „Zusammenhänge“. Du vergleichst zwei Felder, auch mit einem Tag Versatz, und siehst die Stärke in Worten samt Anzahl der Tage. Unter 14 Tagen gibt es nur einen Hinweis statt einer Zahl.',
      'Mögliche Auslöser: Wie oft ein Ereignis an Tagen mit hohen Werten vorkam, mit Fallzahl. Ein Zusammenhang ist keine Ursache.',
      'Neu: Einstellungen → Hinweise. Du legst fest, wann dich die App auf einen Wert hinweisen soll, etwa „Schmerz ≥ 7 an 3 Tagen in Folge“. Der Hinweis erscheint auf der Startseite und, wenn erlaubt, als Benachrichtigung. Er beschreibt nur, was in deinen Einträgen steht.',
    ],
  },
  {
    version: '3.5.0-alpha.1',
    date: '2026-11-16',
    points: [
      'Neu: KI-Funktionen, wenn dein Server sie eingerichtet hat. Du schaltest sie unter Einstellungen → KI-Funktionen ausdrücklich ein, vorher ist nichts davon sichtbar.',
      'Aus Text ausfüllen: Du beschreibst in eigenen Worten, wie es dir geht, und bekommst einen Entwurf für die Felder. Gespeichert wird erst, wenn du es bestätigst.',
      'Im Vorlagen-Editor schlägt die KI Rollen für Bausteine vor, die du einzeln übernimmst oder verwirfst.',
      'Zusammenfassung für den Arzt: Die KI formuliert aus deinen Kennzahlen einen Text, den du bearbeiten und als Abschnitt in den PDF-Export aufnehmen kannst. Notizen gehen nur mit, wenn du sie ausdrücklich freigibst.',
      'Vor jedem Vorgang siehst du genau, was gesendet wird und an wen. Die KI stellt keine Diagnosen und gibt keine Therapieempfehlungen.',
    ],
  },
  {
    version: '3.4.0-alpha.1',
    date: '2026-11-16',
    points: [
      'Neu: Arzt-Link. Im Export erstellst du einen befristeten Link zu deinem Bericht. Der Bericht wird auf deinem Gerät verschlüsselt, der Schlüssel steckt nur im Link.',
      'Wer den Link öffnet, braucht kein Konto und sieht Tabelle, Diagramme und das PDF zum Herunterladen.',
      'Du legst Ablauf und Höchstzahl der Aufrufe fest und siehst unter dem Knopf alle Links mit ihren Aufrufen. Ein Link lässt sich jederzeit widerrufen.',
    ],
  },
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
