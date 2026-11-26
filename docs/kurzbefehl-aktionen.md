# Kurzbefehl „Schmerztagebuch eintragen“: alle Aktionen (Zeilenformat)

Stand 2026-11-26 (FEAT-024). Diese Liste ersetzt die frühere Bauanleitung. Der Kurzbefehl wird **einmal** gebaut und muss
nie angepasst werden: Vorlagen, Felder, Optionen und der Text für das Sprachmodell kommen bei jedem Lauf frisch aus der App.

- Aktionen mit **[x]** sind genau so am iPhone gebaut und getestet (Teile A bis C, Stand 2026-11-26).
- Aktionen mit **[ ]** sind neu oder geändert und noch nicht am iPhone getestet.
- **(am iPhone prüfen)** heißt: Diesen Namen konnte ich weder im Apple-Handbuch „Kurzbefehle“ (iOS 26) noch in deinem
  bisherigen Test belegen. Heißt er auf deinem iPhone anders, nimm den passenden und notiere es hier.

## So liest du die Liste

- Jede Nummer ist **eine Aktion**. Halte die Reihenfolge genau ein.
- So fügst du eine Aktion hinzu: unten auf das Suchfeld für Aktionen tippen, den Namen der Aktion eingeben, die Aktion antippen.
  Sie erscheint unter der letzten Aktion.
- `[name]` in eckigen Klammern ist eine **Variable**. So setzt du sie ein: in das Feld tippen. Über der Tastatur erscheint die
  **Variablenleiste**. Dort die Variable mit diesem Namen antippen. Ist sie nicht zu sehen: in der Variablenleiste auf
  **Variable auswählen** tippen und sie dort antippen. Eine eingesetzte Variable ist ein farbiges Kästchen. Tippe den Namen nie als Text ein.
- `„wort“` in Anführungszeichen: genau so **eintippen**, ohne die Anführungszeichen.
- **↳** bedeutet: Die Aktion gehört **in** die darüberstehende „Wenn“-, „Wiederholen“- oder Menü-Klammer. Ziehe sie dorthin,
  falls sie darunter landet.
- „Ende“-Zeilen („Ende von „Wenn““, „Beenden“) legt die App selbst an. Sie haben keine Nummer.
- **„Ergebnis der Aktion direkt darüber“** heißt: In der Variablenleiste das blaue Kästchen der Aktion wählen, die genau eine
  Zeile höher steht. Das ist die einzige Stelle, an der es auf die Reihenfolge ankommt. Danach wird das Ergebnis immer
  sofort unter einem eigenen Namen gespeichert, alle späteren Aktionen verwenden nur diese Namen.
- **⏎** heißt: In einem Textfeld die Zeilenumbruch-Taste der Tastatur drücken (neue Zeile).

---

## Teil A: Zugangsdaten und Sprachmodell

- [x] **1. Text**
  - Textfeld: deine Zugangsdaten aus der App (Tagebuch → Kurzbefehl → „Zugangsdaten kopieren“, hier einfügen).
  - Vor dem Teilen ersetzt du sie durch „ZUGANG“ (siehe „Fertigstellen“).
- [ ] **2. Variable festlegen**
  - Variablenname: „zugang“
  - Wert: Ergebnis der Aktion direkt darüber (`Text`)
- [x] **3. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „url“
  - Wörterbuch: `[zugang]`
- [x] **4. Variable festlegen**
  - Variablenname: „url“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [x] **5. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „token“
  - Wörterbuch: `[zugang]`
- [x] **6. Variable festlegen**
  - Variablenname: „token“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **7. Text**
  - Textfeld: „ja“
  - Das ist die Antwort auf „Sprachmodell verwenden?“. Beim Import fragt das iPhone danach (siehe „Fertigstellen“).
- [ ] **8. Variable festlegen**
  - Variablenname: „modell“
  - Wert: Ergebnis der Aktion direkt darüber (`Text`)

## Teil B: Vorlagen vom Server holen

- [x] **9. Inhalte von URL abrufen**
  - URL: `[url]` und direkt dahinter „/manifest“ (ohne Leerzeichen)
  - Pfeil neben der URL antippen, um die weiteren Felder zu öffnen.
  - Methode: `GET`
  - Header: „Neuen Header hinzufügen“, links „Authorization“, rechts „Bearer “ (mit einem Leerzeichen am Ende) und dahinter `[token]`
- [x] **10. Variable festlegen**
  - Variablenname: „manifest“
  - Wert: Ergebnis der Aktion direkt darüber (`Inhalt der URL`)
- [x] **11. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „error“
  - Wörterbuch: `[manifest]`
- [x] **12. Variable festlegen**
  - Variablenname: „fehler“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [x] **13. Wenn**
  - Eingabe: `[fehler]`
  - Bedingung: `hat einen beliebigen Wert`
- [x] ↳ **14. Text sprechen**
  - Text: `[fehler]`
- [x] ↳ **15. Kurzbefehl stoppen**
  - keine Felder
  - *Ende von „Wenn“*

## Teil C: Vorlage auswählen

- [x] **16. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „templates“
  - Wörterbuch: `[manifest]`
- [x] **17. Variable festlegen**
  - Variablenname: „templates“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [x] **18. Wörterbuch**
  - leer lassen, nichts eintragen
- [x] **19. Variable festlegen**
  - Variablenname: „vorlagen“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuch`)
- [x] **20. Wiederholen mit jedem**
  - Eingabe: `[templates]`
- [x] ↳ **21. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „name“
  - Wörterbuch: `Objekt wiederholen`
- [x] ↳ **22. Wörterbuchwert festlegen**
  - Schlüssel: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
  - Wert: `Objekt wiederholen`
  - Wörterbuch: `[vorlagen]`
- [x] ↳ **23. Variable festlegen**
  - Variablenname: „vorlagen“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuch`)
  - *Beenden*
- [ ] **24. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert` antippen und auf `Alle Schlüssel` umstellen (am iPhone prüfen)
  - Wörterbuch: `[vorlagen]`
- [ ] **25. Aus Liste auswählen**
  - Liste: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
  - Aufforderung: „Welche Vorlage?“ (Feldname am iPhone prüfen)
  - „Mehrere auswählen“ bleibt aus.
- [ ] **26. Variable festlegen**
  - Variablenname: „vorlagenname“
  - Wert: Ergebnis der Aktion direkt darüber (`Ausgewähltes Objekt`, Name am iPhone prüfen)
- [ ] **27. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: `[vorlagenname]`
  - Wörterbuch: `[vorlagen]`
- [ ] **28. Variable festlegen**
  - Variablenname: „vorlage“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **29. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „id“
  - Wörterbuch: `[vorlage]`
- [ ] **30. Variable festlegen**
  - Variablenname: „vorlageId“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **31. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „prompt“
  - Wörterbuch: `[vorlage]`
- [ ] **32. Variable festlegen**
  - Variablenname: „prompt“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)

## Teil D: Diktieren

- [ ] **33. Text diktieren** (am iPhone prüfen)
  - Sprache: `Deutsch (Deutschland)` (genaue Bezeichnung am iPhone prüfen)
  - Zuhören beenden: `Nach Pause` (am iPhone prüfen)
- [ ] **34. Variable festlegen**
  - Variablenname: „diktat“
  - Wert: Ergebnis der Aktion direkt darüber (`Diktierter Text`, Name am iPhone prüfen)
- [ ] **35. Text**
  - Textfeld, genau zwei Zeilen:
    - erste Zeile: „Diktat: “ und dahinter `[diktat]`
    - ⏎
    - zweite Zeile: „Sprachmodell: “ und dahinter `[modell]`
- [ ] **36. Variable festlegen**
  - Variablenname: „zeilen“
  - Wert: Ergebnis der Aktion direkt darüber (`Text`)

Ab hier sammelt der Kurzbefehl alles in `[zeilen]`: eine Zeile pro Angabe, Form „Feld: Wert“. Gibt es ein Feld zweimal,
gilt die letzte Zeile. So überschreibt eine Antwort auf eine Rückfrage, was das Sprachmodell geschrieben hat.

## Teil E: Sprachmodell (nur wenn „ja“)

- [ ] **37. Wenn**
  - Eingabe: `[modell]`
  - Bedingung: `ist`
  - Text: „ja“
- [ ] ↳ **38. Text**
  - Textfeld: `[prompt]`, ein Leerzeichen, `[diktat]`
  - (Der Text für das Sprachmodell endet schon mit „Diktat:“. Das Diktat kommt direkt dahinter.)
- [ ] ↳ **39. Variable festlegen**
  - Variablenname: „anfrage“
  - Wert: Ergebnis der Aktion direkt darüber (`Text`)
- [ ] ↳ **40. Modell verwenden** (am iPhone prüfen; englisch „Use Model“)
  - Modell: das Modell auf dem Gerät (englisch „On-Device“). Du kannst hier später auch ein anderes Modell wählen, der Rest
    des Kurzbefehls bleibt gleich. Hinweis: Bei Modellen in der Cloud oder ChatGPT gehen Diktat und Vorlagenaufbau an Apple bzw. OpenAI.
  - Textfeld der Anfrage: nur `[anfrage]`
  - Ausgabe (englisch „Output“): `Text` (am iPhone prüfen)
  - Nachfragen (englisch „Follow Up“): aus
- [ ] ↳ **41. Variable festlegen**
  - Variablenname: „modellzeilen“
  - Wert: Ergebnis der Aktion direkt darüber (Antwort des Modells, Name am iPhone prüfen)
- [ ] ↳ **42. Text**
  - Textfeld: `[zeilen]`, ⏎, `[modellzeilen]`
- [ ] ↳ **43. Variable festlegen**
  - Variablenname: „zeilen“
  - Wert: Ergebnis der Aktion direkt darüber (`Text`)
  - *Ende von „Wenn“* (ein „Sonst“-Zweig bleibt leer bzw. wird nicht angelegt)

## Teil F: Erste Prüfung

- [ ] **44. Inhalte von URL abrufen**
  - URL: `[url]` und direkt dahinter „/check“
  - Pfeil neben der URL antippen.
  - Methode: `POST`
  - Header 1: links „Authorization“, rechts „Bearer “ (mit Leerzeichen) und `[token]`
  - Header 2: links „Content-Type“, rechts „application/json“
  - Haupttext anfordern: `JSON` (am iPhone prüfen)
  - Feld 1: „Neues Feld hinzufügen“ → Typ `Text`, Schlüssel „templateId“, Wert `[vorlageId]`
  - Feld 2: „Neues Feld hinzufügen“ → Typ `Text`, Schlüssel „lines“, Wert `[zeilen]`
  - (Bezeichnungen „Neues Feld hinzufügen“ und „Typ“ am iPhone prüfen.)
- [ ] **45. Variable festlegen**
  - Variablenname: „antwort“
  - Wert: Ergebnis der Aktion direkt darüber (`Inhalt der URL`)
- [ ] **46. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „error“
  - Wörterbuch: `[antwort]`
- [ ] **47. Variable festlegen**
  - Variablenname: „fehler“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **48. Wenn**
  - Eingabe: `[fehler]`
  - Bedingung: `hat einen beliebigen Wert`
- [ ] ↳ **49. Text sprechen**
  - Text: `[fehler]`
- [ ] ↳ **50. Kurzbefehl stoppen**
  - *Ende von „Wenn“*

## Teil G: Rückfragen

Der Server liefert eine fertige Liste von Fragen: zuerst unklare Angaben („Option „Ferse“ gibt es nicht. Meintest du …?“),
dann leere Felder. Welche leeren Felder gefragt werden, stellst du in der App ein (Kurzbefehl → „Nachfragen“). Ohne
Sprachmodell werden immer alle Felder gefragt.

- [ ] **51. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „questions“
  - Wörterbuch: `[antwort]`
- [ ] **52. Variable festlegen**
  - Variablenname: „fragen“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **53. Wiederholen mit jedem**
  - Eingabe: `[fragen]`
- [ ] ↳ **54. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „question“
  - Wörterbuch: `Objekt wiederholen`
- [ ] ↳ **55. Variable festlegen**
  - Variablenname: „frage“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] ↳ **56. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „label“
  - Wörterbuch: `Objekt wiederholen`
- [ ] ↳ **57. Variable festlegen**
  - Variablenname: „feld“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] ↳ **58. Nach Eingabe fragen**
  - Eingabetyp: `Text`
  - Aufforderung (das Feld hinter „mit“): `[frage]`
  - Standardantwort: leer lassen (Feldname am iPhone prüfen)
- [ ] ↳ **59. Variable festlegen**
  - Variablenname: „eingabe“
  - Wert: Ergebnis der Aktion direkt darüber (`Bereitgestellte Eingabe`, Name am iPhone prüfen)
- [ ] ↳ **60. Wenn**
  - Eingabe: `[eingabe]`
  - Bedingung: `hat einen beliebigen Wert`
- [ ] ↳↳ **61. Text**
  - Textfeld: `[zeilen]`, ⏎, `[feld]`, „: “ (Doppelpunkt und Leerzeichen), `[eingabe]`
- [ ] ↳↳ **62. Variable festlegen**
  - Variablenname: „zeilen“
  - Wert: Ergebnis der Aktion direkt darüber (`Text`)
  - *Ende von „Wenn“*
  - *Beenden* (Ende der Wiederholung)

So antwortest du bei Rückfragen:
- Leere Antwort (gleich „Fertig“): Feld wird übersprungen.
- „Meintest du „Plantarfaszie“?“: „ja“ übernimmt den Vorschlag, „nein“ verwirft ihn. Oder die richtige Option nennen.
- Mehrere Optionen: mit „und“ oder Komma verbinden („stechend und ziehend“). Zahlen als Ziffer oder Wort („6“ oder „sechs“).
- Ja/Nein-Felder: „ja“ oder „nein“.

## Teil H: Zweite Prüfung und Bestätigung

- [ ] **63. Inhalte von URL abrufen**
  - URL: `[url]` und direkt dahinter „/check“
  - Pfeil neben der URL antippen.
  - Methode: `POST`
  - Header 1: links „Authorization“, rechts „Bearer “ (mit Leerzeichen) und `[token]`
  - Header 2: links „Content-Type“, rechts „application/json“
  - Haupttext anfordern: `JSON`
  - Feld 1: Typ `Text`, Schlüssel „templateId“, Wert `[vorlageId]`
  - Feld 2: Typ `Text`, Schlüssel „lines“, Wert `[zeilen]`
- [ ] **64. Variable festlegen**
  - Variablenname: „antwort“
  - Wert: Ergebnis der Aktion direkt darüber (`Inhalt der URL`)
- [ ] **65. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „error“
  - Wörterbuch: `[antwort]`
- [ ] **66. Variable festlegen**
  - Variablenname: „fehler“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **67. Wenn**
  - Eingabe: `[fehler]`
  - Bedingung: `hat einen beliebigen Wert`
- [ ] ↳ **68. Text sprechen**
  - Text: `[fehler]`
- [ ] ↳ **69. Kurzbefehl stoppen**
  - *Ende von „Wenn“*
- [ ] **70. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „summary“
  - Wörterbuch: `[antwort]`
- [ ] **71. Variable festlegen**
  - Variablenname: „zusammenfassung“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **72. Text sprechen**
  - Text: `[zusammenfassung]`
- [ ] **73. Aus Menü auswählen**
  - Aufforderung: „Passt das?“
  - Menüpunkte: „Ja“ und „Nein“
  - Unter „Ja“: nichts
- [ ] ↳ **74. Text sprechen** (unter „Nein“)
  - Text: „Nicht gesendet.“
- [ ] ↳ **75. Kurzbefehl stoppen** (unter „Nein“)
  - *Ende des Menüs*

## Teil I: Senden

- [ ] **76. Inhalte von URL abrufen**
  - URL: nur `[url]` (**nichts** dahinter, also kein „/check“)
  - Pfeil neben der URL antippen.
  - Methode: `POST`
  - Header 1: links „Authorization“, rechts „Bearer “ (mit Leerzeichen) und `[token]`
  - Header 2: links „Content-Type“, rechts „application/json“
  - Haupttext anfordern: `JSON`
  - Feld 1: Typ `Text`, Schlüssel „templateId“, Wert `[vorlageId]`
  - Feld 2: Typ `Text`, Schlüssel „lines“, Wert `[zeilen]`
- [ ] **77. Variable festlegen**
  - Variablenname: „antwort“
  - Wert: Ergebnis der Aktion direkt darüber (`Inhalt der URL`)
- [ ] **78. Wörterbuchwert abrufen**
  - Erstes Feld: `Wert`
  - Schlüssel: „error“
  - Wörterbuch: `[antwort]`
- [ ] **79. Variable festlegen**
  - Variablenname: „fehler“
  - Wert: Ergebnis der Aktion direkt darüber (`Wörterbuchwert`)
- [ ] **80. Wenn**
  - Eingabe: `[fehler]`
  - Bedingung: `hat einen beliebigen Wert`
- [ ] ↳ **81. Text sprechen**
  - Text: `[fehler]`
- [ ] ↳ **82. Kurzbefehl stoppen**
  - *Ende von „Wenn“*
- [ ] **83. Mitteilung anzeigen** (im Handbuch auch „Mitteilung zeigen“)
  - Text: „Eintrag gesendet ✓“

---

## Fertigstellen

1. **Name:** Abwärtspfeil neben dem Namen des Kurzbefehls → „Umbenennen“ → „Schmerztagebuch eintragen“ → „Fertig“.
   Der Name ist zugleich der Siri-Satz: „Hey Siri, Schmerztagebuch eintragen“.
2. **Testen:** Kurzbefehl einmal mit ▶ ausführen. Danach in der App unter Kurzbefehl → Schritt 4 „Prüfen“ antippen.
   Im Eintrag zeigt „Rohdaten des Kurzbefehls“ Diktat und alle Zeilen.
3. **Ohne Modell testen:** In Aktion 7 „nein“ eintragen und erneut ausführen: Jetzt fragt der Kurzbefehl alle Felder ab.
   Danach wieder „ja“ eintragen.
4. **Platzhalter:** In Aktion 1 die Zugangsdaten durch „ZUGANG“ ersetzen.
5. **Importfragen** (laut Apple-Handbuch: im Editor → „Konfiguration“ → „Neue Frage hinzufügen“):
   - Frage 1: das Textfeld von Aktion 1 wählen. Fragetext: „Füge die Zugangsdaten aus der App ein“. Standardantwort: leer.
   - Frage 2: das Textfeld von Aktion 7 wählen. Fragetext: „Sprachmodell verwenden? ja oder nein“.
     Standardantwort: „ja“. Ältere iPhones ohne Apple Intelligence antworten „nein“.
6. **Teilen:** Teilen-Symbol → „iCloud-Link kopieren“ → „Link kopieren“. Den Link gibst du mir, er kommt in die App
   (Knopf „Kurzbefehl laden“).

## Fehlermeldungen

| Siri sagt | Bedeutung |
|---|---|
| `unauthenticated` | Zugangsdaten ungültig oder widerrufen: in der App neue Zugangsdaten kopieren, Kurzbefehl neu importieren |
| `manifest-missing` | App öffnen und einmal synchronisieren |
| `rate-limited` | Zu viele Anfragen in einer Stunde, später erneut versuchen |
| `invalid-request` | Daten falsch aufgebaut: Aktionen 44, 63 oder 76 prüfen (Felder „templateId“ und „lines“) |
| `template-unknown` | Vorlage gibt es nicht mehr: Kurzbefehl neu starten |

## Bekannte Grenzen

- Das Sprachmodell kann plausible, aber falsche Werte schreiben. Höre bei der Zusammenfassung genau hin.
- Das Modell auf dem Gerät hat wenig Platz. Ist eine Vorlage zu groß, bricht „Modell verwenden“ ab. Die App warnt auf der
  Kurzbefehl-Seite und im Vorlagen-Editor („Für den Kurzbefehl schwierig“). Kurznamen für lange Optionen helfen.
- Körperkarte, Übungen und Zeitpunkt/Zeitraum lassen sich nicht per Kurzbefehl füllen. Der Eintrag bekommt die Uhrzeit des
  Sendens, korrigierbar in der App. Ein Datumsfeld braucht ein vollständiges Datum („26. November 2026“).
- Halbe Werte („sechseinhalb“) und Spannen („zwischen fünf und sechs“) werden nicht erkannt.
- Ohne Netz oder ohne Verbindung zum Server gibt es keine Vorlagen und kein Senden.
- Ein Kurzbefehl gehört zu einem Tagebuch.
