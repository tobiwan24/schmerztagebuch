# Schmerztagebuch MCP-Server (lokal, nur lesend)

Dieser Server lässt einen KI-Assistenten (zum Beispiel Claude Desktop oder Claude Code) dein Schmerztagebuch **lesen**.
Er läuft auf deinem eigenen Rechner (stdio), nicht auf dem Server. Er kann nichts schreiben oder löschen: Der Zugang
(Integration) erlaubt dem Server nur das Lesen von Chiffretext, entschlüsselt wird ausschließlich in diesem Prozess.

**Datenschutz:** Was die Tools zurückgeben (Einträge, Notizen, Kennzahlen), sieht der angebundene Assistent und damit
dessen Anbieter. Richte das nur ein, wenn du das möchtest. Die Auswertungen sind beschreibend, keine Diagnose und keine
Therapieempfehlung.

## Einrichtung

1. **Zugang anlegen:** In der App unter Einstellungen → Integrationen einen Namen eingeben und „Integration anlegen“
   wählen. Den Zugangsstring (`stbi1.…`) sofort kopieren, er wird nur einmal angezeigt. Nur der Besitzer des Tagebuchs
   kann Integrationen anlegen (Konto-Modus mit Sync). Pro Tagebuch sind 10 aktive Integrationen möglich.
2. **Server bauen** (im Ordner `v3/`, Node 22 oder neuer):

   ```sh
   npm ci
   npx tsc -b apps/mcp
   ```

   Das erzeugt `apps/mcp/dist/main.js`.
3. **Beim Assistenten eintragen.**

   Claude Code:

   ```sh
   claude mcp add schmerztagebuch --env STB_ACCESS_STRING='stbi1.…' -- node /voller/pfad/zu/v3/apps/mcp/dist/main.js
   ```

   Claude Desktop (`claude_desktop_config.json`):

   ```json
   {
     "mcpServers": {
       "schmerztagebuch": {
         "command": "node",
         "args": ["/voller/pfad/zu/v3/apps/mcp/dist/main.js"],
         "env": { "STB_ACCESS_STRING": "stbi1.…" }
       }
     }
   }
   ```

   Unter Windows Pfade mit `\\` oder `/` schreiben. Danach den Assistenten neu starten.

## Umgebung

| Variable | Bedeutung |
|---|---|
| `STB_ACCESS_STRING` | Pflicht. Zugangsstring aus der App. Enthält Token und Schlüssel, wie ein Passwort behandeln. |
| `STB_BASE_URL` | Optional. Server-Adresse; überschreibt die im Zugangsstring enthaltene. |

## Tools

| Tool | Zweck |
|---|---|
| `list_diaries` | Tagebuch, Vorlagen, Anzahl der Einträge und Zeitraum. |
| `search_entries` | Einträge nach Text, Zeitraum (`from` und `to`), Tags und Vorlage; `limit` 1 bis 100 (Standard 20), neueste zuerst. |
| `get_entry` | Einen Eintrag vollständig (alle Felder, Tags, Wetter). |
| `stats` | Kennzahlen (Anzahl Tage, Mittelwert, Median, Minimum, Maximum) für eine Rolle oder einen Block, im Vergleich zum Zeitraum davor. |

Der Server gleicht sich höchstens alle 30 Sekunden mit dem Server ab; neue Einträge sind also kurz nach dem Speichern
sichtbar.

## Widerruf und Schlüsselrotation

Widerrufe den Zugang in der App unter Einstellungen → Integrationen, wenn du ihn nicht mehr brauchst oder der Zugangsstring
in falsche Hände geraten ist. Eine Schlüsselrotation (nach dem Entfernen eines Mitglieds oder dem Sperren eines Geräts)
widerruft alle Integrationen; lege danach einen neuen Zugang an. Meldet ein Tool „Zugang ungültig oder widerrufen“,
ist das der Grund.

## Entwicklung

Der Test `integration/mcp/mcp.test.ts` (EXP-28) startet den Server mit einem In-Process-MCP-Client gegen den Export-Fixture
und den In-Process-Sync-Server.
