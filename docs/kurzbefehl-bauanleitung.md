# Bauanleitung: Kurzbefehl „Schmerztagebuch eintragen“ (FEAT-023)

Einmaliger Bau am iPhone. Danach installieren andere den Kurzbefehl über den iCloud-Link (`SHORTCUT_ICLOUD_URL` in
`apps/web/src/intake/config.ts`). Der Kurzbefehl holt bei jedem Lauf das aktuelle Manifest des Tagebuchs, muss also bei
Vorlagenänderungen nie angepasst werden. Spezifikation: `spec/08-voice-llm.md` (Manifest, Prüfen, Mischform).

## Voraussetzungen

- Konto mit Cloud-Tagebuch, Kurzbefehl in der App eingerichtet (Tagebuch → Kurzbefehl, Schritte 1 bis 3).
- In der App „Zugangsdaten kopieren“ gedrückt: In der Zwischenablage liegt `{"url": "...", "token": "..."}`.

## Importfrage „Zugangsdaten“

Beim Hinzufügen des Kurzbefehls fragt Apple nach den Importfragen. Frage 1: „Füge die Zugangsdaten aus der App ein“
(Typ Text). Der Kurzbefehl liest daraus `url` und `token` (Aktion „Wörterbuch aus Eingabe abrufen“).

## Aktionen, Schritt für Schritt

1. **Text** (Importfrage-Platzhalter) → **Wörterbuch aus Eingabe abrufen** → Variablen `url` und `token` aus den Schlüsseln setzen.
2. **Inhalte von URL abrufen**: `url` + `/manifest`, Methode GET, Header `Authorization: Bearer <token>`.
   Fehlerzweige: Statuscode 401 → „Zugang ungültig, in der App neue Zugangsdaten kopieren“; 404 → „In der App einmal synchronisieren“;
   429 → „Zu viele Anfragen, später wieder“; kein Netz → „Offline, später erneut“ (Fehler anzeigen und beenden).
3. **Wörterbuch aus Eingabe abrufen** → `templates` als Liste. **Aus Liste auswählen** (Namen `name`); bei nur einer Vorlage entfällt die Frage,
   sonst Standard `defaultTemplateId`. Gewählte Vorlage in `tpl` speichern (`id`, `prompt`, `fields`).
4. **Aktuelles Datum** (Format ISO 8601) in `jetzt` speichern.
5. **Diktieren** („Was möchtest du eintragen?“, Sprache Deutsch) → `diktat`.
6. **Modell verwenden** (On-Device oder Private Cloud Compute der Kurzbefehle-App) mit diesem Prompt:
   ```
   {tpl.prompt}

   Heute ist {jetzt}. Rechne relative Zeitangaben („vor 2 Stunden“, „gestern Abend“) in einen ISO-Zeitpunkt für "occurredAt" um.
   Diktat: {diktat}
   ```
   Ausgabe als Wörterbuch (JSON) → `eintrag`; `eintrag.templateId` auf `tpl.id` setzen.
7. **Prüfen**: **Inhalte von URL abrufen** `url` + `/check`, POST, JSON = `eintrag`, Header wie in 2.
   Antwort: `missing` (Felder mit `question`, `type`, `options`, `min`, `max`), `invalid` (`field`, `message`), `summary`.
8. **Wiederholen für jedes Element** in `invalid` und `missing`:
   - `question` per **Nach Eingabe fragen** (Typ je Feld: Zahl für `slider`, Auswahl aus `options` für `multiselect`/`medication`,
     Ja/Nein per „Aus Menü auswählen“ für `checkbox`, sonst Text). Für ungültige Felder zusätzlich `message` vorlesen.
   - Pflichtfelder (`required`) bestehen auf einer Antwort; bei optionalen Feldern überspringt eine leere Antwort das Feld.
   - Antwort in `eintrag.values[field.id]` eintragen.
9. **Prüfen** erneut (wie 7); bleibt `invalid` nicht leer, zurück zu 8.
10. **Sprechen** `summary` und **Aus Menü auswählen**: „Passt das?“ (Ja / Nein). Bei Nein: abbrechen oder zu 5.
11. **Inhalte von URL abrufen**: `url`, POST, JSON = `eintrag`, Header wie in 2. Erwartet `202`; 401 und 429 wie in 2, sonst Fehler anzeigen.
12. **Benachrichtigung** „Eintrag gesendet“ (die App holt ihn beim nächsten Sync ab).

## Auslöser

- Siri: Name des Kurzbefehls „Schmerztagebuch eintragen“ → „Hey Siri, Schmerztagebuch eintragen“.
- Action-Button (iPhone 15 Pro und neuer): Einstellungen → Action-Button → Kurzbefehl.
- Sperrbildschirm: Steuerungszentrale/Sperrbildschirm-Widget „Kurzbefehl ausführen“.
- Apple Watch: Der Kurzbefehl erscheint automatisch in der Kurzbefehle-App der Watch (Diktat läuft dort).

## Veröffentlichen

Kurzbefehl teilen → „iCloud-Link kopieren“ → Link in `SHORTCUT_ICLOUD_URL` eintragen. Dann zeigt die App „Kurzbefehl laden“.
Anschließend VOI-24 durchspielen und eine Vorlage ändern: Der nächste Lauf muss die neue Frage stellen.
