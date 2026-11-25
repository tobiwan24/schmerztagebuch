// Neuigkeiten je Version (UI-26, A-081). Neueste zuerst. Pro Version Datum und 1–6 Punkte, für Nutzer formuliert.
// Jede Version, die `APP_VERSION` wird, braucht hier einen Eintrag (Test whats-new.test.ts).
import type { Release } from './whats-new.js';

export const changelog: readonly Release[] = [
  {
    version: '3.17.0-alpha.1',
    date: '2026-11-25',
    points: [
      'Ein Kurzbefehl für alle Vorlagen: „Hey Siri, Schmerztagebuch eintragen“ holt bei jedem Lauf die aktuellen Vorlagen deines Tagebuchs – nach Vorlagenänderungen musst du den Kurzbefehl nicht mehr anpassen.',
      'Mischform: Du sprichst frei, der Kurzbefehl fragt fehlende oder ungültige Felder einzeln nach, liest eine Zusammenfassung vor und sendet den Eintrag erst nach „Passt das?“.',
      'Die Kurzbefehl-Seite führt in vier Schritten durch Hinweis, Installieren, Zugangsdaten kopieren und Testen („Angekommen ✓“). Der Hinweis nennt neu, dass die Vorlagen beim Abruf kurz unverschlüsselt auf dem Server gelesen werden.',
    ],
  },
  {
    version: '3.16.0-alpha.1',
    date: '2026-11-25',
    points: [
      'Schneller entsperren: Mit Passkey startet Face ID bzw. der Fingerabdruck sofort, wenn du die App öffnest oder zurückholst – ohne zusätzlichen Tipp.',
      '„Auf diesem Gerät entsperrt bleiben“ gibt es nicht mehr; die automatische Sperre bei Inaktivität bleibt einstellbar.',
      'Vorlagen sortieren: Unter Mehr → Vorlagen zeigt „Reihenfolge ändern“ eine kompakte Liste. Beim Ziehen scrollt die Liste am Rand mit.',
    ],
  },
  {
    version: '3.15.0-alpha.1',
    date: '2026-11-25',
    points: [
      'Vorlagen pro Tagebuch: Start, „Neuer Eintrag“ und der Schnelleintrag zeigen nur noch die Vorlagen des oben gewählten Tagebuchs.',
      'Eigener Vorlagenkatalog: Unter Mehr → Vorlagen fügst du eine Vorlage mit „Zum Vorlagenkatalog hinzufügen“ hinzu – auch aus einem geteilten Tagebuch – und legst sie später in jedem Tagebuch an.',
      'Der Vorlagenkatalog ist auf allen deinen Geräten gleich und im Backup enthalten. Geänderte Vorlagen aktualisierst du dort per Knopfdruck.',
    ],
  },
  {
    version: '3.14.0-alpha.1',
    date: '2026-11-24',
    points: [
      'Übungen mit eigenem Video: Im Vorlagen-Editor lädst du beim Übungsfeld ein Video hoch (MP4, WebM oder MOV bis 20 MB); im Training spielst du es direkt in der App ab.',
      'Schritt-für-Schritt-Anleitung mit Bildern: Jeder Schritt einer Übung kann ein Foto bekommen. Im Training blätterst du dann mit „Nächster Schritt“ durch die Anleitung.',
      'Videos und Bilder werden wie Anhänge verschlüsselt synchronisiert und sind im Backup enthalten. Der Video-Link bleibt zusätzlich möglich.',
    ],
  },
  {
    version: '3.13.0-alpha.1',
    date: '2026-11-24',
    points: [
      'Einladen per QR-Code: Unter „Mitglieder & Einladungen“ zeigt „QR-Code anzeigen“ einen Code, den die eingeladene Person in der App unter Mehr → Tagebücher → „Einladung scannen“ einliest. So öffnet sich nichts im Browser.',
      'Der QR-Code gilt 10 Minuten und nur einmal; schließt du das Fenster, ist er ungültig. Sobald die Person beigetreten ist, siehst du es direkt im Fenster.',
      'Ohne Kamera kannst du im Scanner auch den Code oder den Einladungslink einfügen.',
    ],
  },
  {
    version: '3.12.0-alpha.2',
    date: '2026-11-24',
    points: [
      'Die Symbole für Ereignis, Arztbesuch und Foto zeigen beim Darüberfahren einen Hinweis.',
      'Im Export wählst du den Zeitraum im Kalender; „Dieser Monat“ und „Voriger Monat“ gibt es dort als Schnellauswahl.',
      'Gespeicherte Filter werden auch im Export nicht mehr angeboten.',
    ],
  },
  {
    version: '3.12.0-alpha.1',
    date: '2026-11-24',
    points: [
      'Datum und Zeitraum wählst du jetzt überall in einem Kalender-Fenster, die Uhrzeit daneben.',
      'Im Verlauf öffnet „Zeitraum“ einen Kalender mit Schnellauswahl (Alle, 7, 30, 90 Tage); Vorlagen stehen getrennt von den weiteren Filtern, „Übernehmen“ schließt die Filter.',
      'Filter bleiben erhalten, wenn du einen Eintrag öffnest und zurückkehrst; nach einem Neustart der App sind sie zurückgesetzt. „Filter speichern“ gibt es nicht mehr.',
      'Im neuen Eintrag sind Ereignis, Arztbesuch und Foto jetzt kompakte Symbole nebeneinander.',
    ],
  },
  {
    version: '3.11.0-alpha.1',
    date: '2026-11-24',
    points: [
      'Die Startseite zeigt für jede ausgewählte Vorlage einen eigenen Schnell-Button; welche, legst du in den Einstellungen des Tagebuchs fest. Die Eintragsliste ist jetzt im Verlauf.',
      'Im Verlauf hat jeder Eintrag eine eigene Card mit Symbol, Titel, Kennzeichen und Schmerzwert; der Kopf mit Suche, Filter und Sortierung ist kompakter.',
      'Die Detailansicht zeigt das Datum als Titel, darunter den Namen der Vorlage.',
      'In der Auswertung lassen sich die Ansichten seitlich wischen; lange Knöpfe brechen jetzt um.',
      'Die Einstellungen sind neu geordnet (Konto & Sync zuerst, der Backup-Code dort am Ende); Geräte erscheinen mit lesbaren Namen.',
    ],
  },
  {
    version: '3.10.0-alpha.1',
    date: '2026-11-17',
    points: [
      'Neu: Einstellungen → Integrationen. Du legst einen Zugang an, mit dem ein Programm dein Tagebuch nur lesen darf. Der Zugangsstring erscheint genau einmal; kopiere ihn sofort. Du siehst, wann ein Zugang zuletzt genutzt wurde, und kannst ihn jederzeit widerrufen.',
      'Neu: ein lokaler MCP-Server (Ordner apps/mcp, Anleitung in der README). Damit kann ein KI-Assistent wie Claude auf deinem Rechner Einträge suchen, lesen und Kennzahlen abfragen. Er kann nichts ändern. Was er liest, sieht der Assistent, richte ihn also nur ein, wenn du das möchtest.',
      'Wichtig: Eine Schlüsselrotation (nach dem Entfernen eines Mitglieds oder dem Sperren eines Geräts) widerruft alle Integrationen. Lege danach einen neuen Zugang an.',
    ],
  },
  {
    version: '3.9.0-alpha.1',
    date: '2026-11-17',
    points: [
      'Neu: Einstellungen → „Daten auf dem Gerät verschlüsseln“. Danach liegen deine Einträge auch auf diesem Gerät verschlüsselt und sind ohne Entsperren nicht lesbar. Vorhandene Einträge werden im Hintergrund umgestellt, die App bleibt dabei benutzbar. Die Einstellung lässt sich später nicht wieder ausschalten.',
      'Die Suche startet mit verschlüsselten Daten schneller: Der Suchindex wird (ebenfalls verschlüsselt) auf dem Gerät gespeichert und beim Start nur aktualisiert.',
      'Wenn du später auf „Mit Konto synchronisieren“ wechselst, bleiben lokal verschlüsselte Einträge lesbar.',
    ],
  },
  {
    version: '3.8.0-alpha.1',
    date: '2026-11-17',
    points: [
      'Wenn du jemanden aus einem geteilten Tagebuch entfernst oder ein Gerät sperrst, wird das Tagebuch jetzt mit einem neuen Schlüssel neu verschlüsselt. Die Mitgliederseite zeigt den Fortschritt. Die App darf dabei geöffnet bleiben; wird sie geschlossen, geht es beim nächsten Mal weiter. Die übrigen Mitglieder synchronisieren ohne Unterbrechung weiter.',
      'Neu: Als Besitzer erlaubst du einem Mitglied mit „Darf eintragen“ zusätzlich, Vorlagen zu bearbeiten. Du kannst das Recht jederzeit wieder entziehen.',
      'Neu: Auf der Startseite steht, wie viele neue Einträge andere Mitglieder seit deinem letzten Besuch geschrieben haben. Ein Tipp öffnet den Verlauf, gefiltert auf diese Person.',
    ],
  },
  {
    version: '3.7.0-alpha.1',
    date: '2026-11-17',
    points: [
      'Neu: Auswertung → Dashboards. Du stellst eigene Dashboards aus Ansichten zusammen (Verlauf, Kalender, Medikamententage, Häufigkeiten, Körperkarte, Zusammenhang, Kennzahl), benennst sie um und sortierst sie. Sie werden mit deinen anderen Geräten abgeglichen.',
      'Ein Dashboard lässt sich als ein Bild (PNG) speichern oder als PDF im Layout „Dashboard“ ausgeben. Das PDF zeigt dein Dashboard auf der ersten Seite.',
    ],
  },
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
