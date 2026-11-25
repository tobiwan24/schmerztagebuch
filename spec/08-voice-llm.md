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
   (`intake_keys`). Das Token bleibt zusätzlich im verschlüsselten
   `intakeKey`-Record (FEAT-023, A-153), damit die App die Zugangsdaten jederzeit kopierbar anbieten und das Manifest versiegeln kann.
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

- Seite „Kurzbefehl“ pro Tagebuch: geführter Ablauf in vier Schritten (siehe „Verteilung“), Zugangsdaten (Adresse + Token) kopierbar.
  Der Prompt je Vorlage steht im Manifest (VOI-08); der Kurzbefehl holt ihn selbst.
- Token widerrufen / neu erzeugen; Liste aktiver Intake-Schlüssel.
- **Zwischenablage-Weg** (funktioniert auch in `local-only`): Kurzbefehl kopiert dasselbe JSON in die Zwischenablage;
  in der App „Aus Zwischenablage einfügen" erzeugt daraus einen Eintragsentwurf zur Bestätigung.

## Manifest (FEAT-023, A-153)

Ein allgemeiner Kurzbefehl „Schmerztagebuch eintragen“ wird einmal installiert und holt bei jedem Lauf das aktuelle
**Manifest** des Tagebuchs: `{ v: 1, diary, defaultTemplateId, templates: [{ id, name, version, prompt, fields }] }` mit
`fields: [{ id, label, type, required, question, options?, min?, max? }]` (Körperkarte und Übung fehlen; nur aktive
Nicht-Trainingsvorlagen). Der `prompt` ist `buildShortcutPrompt` (VOI-08), die Fragetexte erzeugt `core` aus Typ und Label.

- **Verteilung:** Die App baut das Manifest (`buildShortcutBundle`) und versiegelt es mit dem Intake-Token
  (`sealManifest`: HKDF-SHA-256 aus dem Token, Salt = Tagebuch-ID, Domain `stb/v3/intake-manifest`, AES-GCM, AAD = Domain +
  Tagebuch-ID). Hochgeladen wird nur das Siegel (`PUT /api/v1/diaries/:id/intake-keys/:keyId/manifest`, Sitzung, `owner`/`editor`,
  ≤ 64 KB), und zwar nur, wenn sich der Hash (`manifestHash`) gegenüber dem letzten Upload ändert (bei der Einrichtung und im
  Sync-Lauf je Cloud-Tagebuch mit Schlüssel). Der Server speichert nur das Siegel (`intake_keys.manifest`); Widerrufen löscht es.
- **Abruf:** `GET /api/v1/intake/:diaryId/manifest` (Bearer-Token). Der Server öffnet das Siegel kurz im Arbeitsspeicher und
  antwortet mit dem Manifest (`no-store`). Falsches/widerrufenes Token → 401, noch kein Upload → 404 `manifest-missing`.
  **Potenzielle Sicherheitslücke** (A-153, im Hinweisdialog genannt): Ein kompromittierter laufender Server kann die
  Vorlagenstruktur beim Abruf mitlesen; ein gestohlenes Token erlaubt erstmals Lesen der Vorlagenstruktur; das Token liegt
  dauerhaft im Schlüssel-Record. Einträge werden weiterhin nur versiegelt gespeichert.

## Prüfen (Dry-Run)

`POST /api/v1/intake/:diaryId/check` (Bearer-Token, Body wie Intake, `templateId` optional → Standardvorlage des Manifests)
antwortet `{ templateId, missing: fields[], invalid: [{ field, message }], summary }` und **speichert nichts**.
`checkIntake` (core) nutzt `mapIntakeToValues`; `missing` enthält alle Felder ohne gültigen Wert (mit `required`),
`summary` ist ein vorlesbarer Satz aus `displayValue`. Rate-Limit und Fehlversuch-Begrenzung wie beim Senden, aber eigener
Zähler (Mischform braucht mehrere Prüfungen je Eintrag).

## Mischform-Ablauf

1. Vorlage wählen. 2. Frei sprechen, das Modell füllt die Felder. 3. Der Kurzbefehl ruft `check` auf und fragt **alle**
fehlenden oder ungültigen Felder einzeln nach (optionale Felder dürfen mit leerer Antwort übersprungen werden).
4. Siri liest die Zusammenfassung vor und fragt „Passt das?“. 5. Senden an den Briefkasten. Auslöser: „Hey Siri,
Schmerztagebuch eintragen“, Action-Button, Sperrbildschirm, Watch. Bauanleitung: `docs/kurzbefehl-bauanleitung.md`.

## Verteilung (iCloud-Link, Anleitung als Fallback)

Geführter Ablauf auf der Kurzbefehl-Seite in vier Schritten: **Hinweis** (Dialog mit Pflicht-Häkchen, nennt die Vorlagen-Ausnahme),
**Installieren** („Kurzbefehl laden“ über `SHORTCUT_ICLOUD_URL`, ausgeblendet solange leer; darunter aufklappbar die Anleitung
zum Selbstbau), **Verbinden** („Zugangsdaten kopieren“: JSON `{ url, token }` für die eine Importfrage des Kurzbefehls),
**Testen** („Prüfen“ stößt einen Sync an und zeigt „Angekommen ✓ (Uhrzeit)“ oder „Noch nichts angekommen“).

## Grenzen

- `local-only`: Intake über den Server ist nicht verfügbar (nur Zwischenablage-Weg).
- Offline-iPhone: der Kurzbefehl meldet den Fehler; es gibt keine Warteschlange im Kurzbefehl (RDM-039).
- Rate-Limit pro Token (Standard 60/h).

## LLM (v3.x, M19)

`packages/llm` (importiert nur `core`): `LlmProvider { id, thirdParty, complete({system, messages, jsonSchema, maxTokens}) }` mit `OllamaProvider` (HTTP `/api/chat`, `format` = JSON-Schema), `AnthropicProvider` (`@anthropic-ai/sdk`, Structured Outputs `output_config.format`), `FakeProvider` und Prompt-Bausteinen. Die Provider laufen **nur im Server** (`apps/server/src/llm`); Schlüssel nur per Env, nie im Client. `LLM_PROVIDER=off|ollama|anthropic` (Standard `off`).

Wie beim Intake ist das eine **sichtbare Ausnahme vom E2E-Grundsatz** (A-086): Der Klartext liegt nur im RAM des Servers, wird nie gespeichert oder geloggt und an den Provider weitergereicht. Freigabe pro Vorgang: Der Dialog zeigt den genauen Text und den Empfänger (eigener Server/Ollama oder Drittanbieter Anthropic, USA). Globaler Opt-in in Einstellungen → KI, Standard aus. Antworten sind nie vertrauenswürdig: zod-Prüfung gegen die Block-Schemas, das Ergebnis ist immer nur ein Entwurf. Keine Diagnose- oder Therapieaussagen (System-Prompt + Hinweis in der UI). local-only und offline: nicht verfügbar.

Endpunkte (angemeldet, Body ≤ 32 KB, Rate-Limit 30/h je Nutzer, Tagesbudget `LLM_DAILY_TOKENS`): `POST /api/v1/llm/{fill,roles,summary}`, `GET /api/v1/llm/status`. Anwendungsfälle: Freitext → Felder (Formular, Schnelleintrag), Rollenvorschläge im Vorlagen-Editor (05), „Zusammenfassung für den Arzt“ (nur Kennzahlen, Notizen nur per Häkchen; bearbeitbar; optional als PDF-Abschnitt). Welche Hardware (GPU) der Server für Ollama hat, klärt VOI-17.

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
| VOI-12 | Provider: Ollama und Anthropic mit gemocktem fetch bzw. SDK (Request-Form, Modell aus der Konfiguration, Timeout, Fehlerabbildung, Refusal/`stop_reason`); Fake ist deterministisch; Prompt-Bausteine für Freitext→Felder (wiederverwendet den Prompt-Generator), Rollen und Zusammenfassung. | unit |
| VOI-13 | Server `POST /api/v1/llm/{fill,roles,summary}`, `GET /api/v1/llm/status`: Anmeldung Pflicht; bei `off` 404/`llm_disabled`; Env per zod geprüft (Fehler, wenn der Schlüssel zum gewählten Provider fehlt); Rate-Limit 30/h je Nutzer und Tagesbudget in Tokens; keine DB-Schreibvorgänge; der Log-Stream enthält den Klartext-Marker nicht; Body ≤ 32 KB. | integration |
| VOI-14 | Formular und Schnelleintrag: „Aus Text ausfüllen“ → Freigabedialog zeigt Text und Empfänger → Ergebnis füllt den Entwurf (geänderte Felder markiert), Speichern nur durch den Nutzer; ungültige Werte werden verworfen und gemeldet (FakeProvider per `page.route`). | e2e |
| VOI-15 | Auswertung/Export „Zusammenfassung für den Arzt“: standardmäßig gehen nur Kennzahlen raus (Notizen nur per Häkchen). Der Text ist bearbeitbar, mit Hinweis „keine Diagnose“, und kann optional als Abschnitt in den PDF-Export. | e2e |
| VOI-16 | Einstellungen → KI-Funktionen: Opt-in Standard aus; zeigt Provider, Modell und „Drittanbieter ja/nein“ aus `status`; alle KI-Knöpfe sind ausgeblendet bei `off`, Opt-in aus oder local-only und deaktiviert, solange offline. | e2e |
| VOI-17 | Echte Provider: Ollama auf der Server-Hardware (Antwortzeit, Qualität auf Deutsch) und/oder Anthropic mit echtem Schlüssel, getestet am iPhone. | manual |
| VOI-18 | Das Manifest enthält alle Vorlagen mit Feldern (Typ, Pflicht, Frage, Optionen, Bereich) und Prompt; die Körperkarte fehlt. | unit |
| VOI-19 | Manifest-Siegel: Token öffnet, falsches Token oder falsches Tagebuch schlägt fehl. | unit |
| VOI-20 | `GET manifest`: 401 bei falschem oder widerrufenem Token, 404 ohne Upload, 200 mit Manifest; DB und Log enthalten keinen Klartext-Marker. | integration |
| VOI-21 | `POST check`: liefert fehlende und ungültige Felder plus Zusammenfassung, schreibt nichts in die DB. | integration |
| VOI-22 | Die App lädt das Manifest nur bei geändertem Hash hoch (Einrichtung und Sync). | integration |
| VOI-23 | Einrichtungsablauf: Hinweis enthält den Vorlagen-Hinweis; Zugangsdaten kopierbar; Testschritt zeigt „Angekommen“. | e2e |
| VOI-24 | Echter Kurzbefehl per iCloud-Link: Mischform-Durchlauf mit „Hey Siri, Schmerztagebuch eintragen“ am iPhone. | manual |
