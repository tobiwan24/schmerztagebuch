# 08 — Kurzbefehle (Siri), LLM

Siri-Erfassung läuft ausschließlich über **Apple Kurzbefehle**. Die Umwandlung von Sprache in Felder macht der
Kurzbefehl auf dem iPhone (Diktat und, wo verfügbar, das On-Device-Modell der Kurzbefehle-App). Die PWA selbst hat
keine Sprachfunktion.

## Problem und Lösung: Intake-Briefkasten

Ein Kurzbefehl kann die installierte PWA nicht zuverlässig mit Daten öffnen (auf iOS landet „URL öffnen" in Safari
mit getrenntem Speicher) und kann selbst nicht AES-GCM/ECDH rechnen. Deshalb:

1. **Einrichten (in der App, pro Tagebuch, Rolle `owner`/`editor`):** Die App erzeugt ein ECDH-P-256-Schlüsselpaar
   `intake`. Der private Schlüssel wird als Record `kind: 'intakeKey'` gespeichert (mit DK verschlüsselt synchronisiert).
   Der öffentliche Schlüssel und der Hash eines zufälligen **Intake-Tokens** (256 Bit) gehen an den Server
   (`intake_keys`). Das Token wird **einmal** angezeigt.
2. **Kurzbefehl:** sendet `POST /api/v1/intake/:diaryId` mit `Authorization: Bearer <token>` und JSON:
   ```ts
   { templateId?: string, occurredAt?: ISO, text?: string,
     values?: { [blockIdOrLabel: string]: number | string | boolean | string[] } }   // max. 16 KB
   ```
3. **Server:** prüft Token, Größe und Form, **versiegelt den Body sofort** (ephemeres ECDH mit `intake`-Public-Key →
   HKDF `stb/v3/intake` → AES-GCM) und speichert nur das Siegel (`intake_items`). Der Klartext wird nie persistiert und
   nie geloggt (Body-Logging für diese Route abgeschaltet). Antwort `202`.
4. **App (bei jedem Sync):** holt Intake-Items, entsiegelt sie mit dem privaten Intake-Schlüssel, bildet sie auf einen
   Eintrag ab und bestätigt die Abholung (Server löscht das Item).

Damit sieht der Server den Inhalt **kurz im Arbeitsspeicher**, aber kann ihn danach selbst nicht mehr lesen.
Das ist eine bewusste, sichtbare Ausnahme vom E2E-Grundsatz (00): Beim Einrichten erklärt ein Dialog das und verlangt
eine Bestätigung. Ohne Einrichtung gibt es keinen Intake.

## Abbildung auf Einträge

- Vorlage: `templateId` oder die Schnelleintrags-Vorlage des Tagebuchs.
- `values`-Schlüssel: Block-ID oder Block-Label (Groß/Klein und Umlaute tolerant). Werte werden mit den Block-Schemas
  (05) validiert; Multiselect-Werte über Options-Labels aufgelöst.
- Nicht zuordenbare Werte und `text` landen im ersten `textarea`-Block (oder als Tag `Kurzbefehl` + Notiz).
- `meta.source = 'shortcut'`, `occurredAt` = angegeben oder Empfangszeit; Wetter wie bei normalen Einträgen.
- Schlägt die Validierung fehl, verschwindet nichts: das Item erscheint im **Eingang** (Liste auf der Startseite) und
  kann von Hand übernommen oder verworfen werden.

## Einrichtungshilfe in der App

- Seite „Kurzbefehl einrichten" pro Tagebuch: Endpunkt-URL, Token (einmalig), Schritt-für-Schritt-Anleitung, und ein
  **kopierbarer Prompt** für das Modell im Kurzbefehl, der die Blöcke der Vorlage mit ID, Label, Typ, Wertebereich und
  Optionen als JSON-Ziel beschreibt (wird aus der aktuellen Vorlagenversion generiert).
- Token widerrufen / neu erzeugen; Liste aktiver Intake-Schlüssel.
- **Zwischenablage-Weg** (funktioniert auch in `local-only`): Kurzbefehl kopiert dasselbe JSON in die Zwischenablage;
  in der App „Aus Zwischenablage einfügen" erzeugt daraus einen Eintragsentwurf zur Bestätigung.

## Grenzen

- `local-only`: Intake über den Server ist nicht verfügbar (nur Zwischenablage-Weg).
- Offline-iPhone: der Kurzbefehl meldet den Fehler; es gibt keine Warteschlange im Kurzbefehl.
- Rate-Limit pro Token (Standard 60/h).

## Backlog v3.x

- LLM-Provider-Abstraktion (`packages/llm`): Ollama lokal (Standard) und Claude API, Freigabe pro Vorgang,
  Anwendungsfälle: Freitext → Felder, Rollenvorschläge, Zusammenfassung für den Arzt. Hardware des Servers (GPU) klären.

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| VOI-01 | Intake einrichten erzeugt Schlüsselpaar; privater Schlüssel liegt nur verschlüsselt im Record, Server kennt nur Public Key + Token-Hash. | integration |
| VOI-02 | Einrichtung ist ohne Bestätigung des Hinweisdialogs nicht abschließbar. | e2e |
| VOI-03 | Intake-Endpunkt: falsches/widerrufenes Token → 401; Body > 16 KB → 413; gültig → 202. | integration |
| VOI-04 | Server speichert nur das Siegel: nach einem Intake enthält die SQLite-DB und das Server-Log keinen Klartext-Marker. | integration |
| VOI-05 | App entsiegelt Items, legt Einträge mit `meta.source = 'shortcut'` an und bestätigt die Abholung; Item ist danach serverseitig gelöscht. | integration |
| VOI-06 | Zuordnung über Block-ID, Label (tolerant) und Options-Labels; nicht zuordenbare Werte landen in der Notiz. | unit |
| VOI-07 | Ungültige Werte erzeugen ein Item im Eingang statt eines Eintrags; nichts geht verloren. | integration |
| VOI-08 | Generierter Kurzbefehl-Prompt enthält alle Blöcke der aktuellen Vorlagenversion mit ID, Typ, Bereich und Optionen. | unit |
| VOI-09 | Zwischenablage-Weg erzeugt einen Eintragsentwurf, der erst nach Bestätigung gespeichert wird (auch in local-only). | e2e |
| VOI-10 | Rate-Limit greift nach 60 Requests pro Stunde und Token. | integration |
| VOI-11 | Echter Kurzbefehl auf dem iPhone: „Hey Siri, Schmerz eintragen" → Eintrag erscheint nach dem nächsten Sync in der App. | manual |
