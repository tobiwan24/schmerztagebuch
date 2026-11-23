# Deployment auf VM 100 (Homelab)

Stand: 2026-11-22 · Version 3.10.0-alpha.1 · gilt für die **Vorschau** (Port 8061) und skizziert die **Umstellung** (Port 8060).
Die Infrastruktur-Fakten (Ports, Caddy, Backup) stehen zusätzlich im Homelab-Repo: `homelab/services/schmerztagebuch.md`,
`homelab/ops/network.md`. Die Ablösung von v2 (Gate G4) beschreibt [GATE-G4.md](GATE-G4.md).

## Überblick

```
Tailscale (nur Tailnet, kein Port-Forwarding)
   │ https (Tailscale-Zertifikat)
   ▼
Caddy (Host-Netzwerk, TLS)  ──►  nginx (`web`, statische PWA, /api/ → server)  ──►  Node-Server (`server`, SQLite + Blobs in /data)
```

| | v2 (Betrieb) | v3 (Vorschau) |
|---|---|---|
| Adresse | `https://ubuntu-docker.tail000296.ts.net:8060` | `https://ubuntu-docker.tail000296.ts.net:8061` |
| Host-Port (nur 127.0.0.1) | 18060 | 18061 |
| Verzeichnis auf der VM | `~/docker/schmerztagebuch/` | `~/docker/schmerztagebuch-v3/v3/` (Compose-Datei liegt in `v3/`) |
| Compose-Projekt | `schmerztagebuch` | `schmerztagebuch-v3` |
| Daten | NFS `/mnt/data/schmerztagebuch/db` | lokales Docker-Volume `schmerztagebuch-v3_stb-data` (Testdaten) |

Der Server-Container hat **keinen** Host-Port, erreichbar ist nur `web` über `127.0.0.1:<Port>` und Caddy.

## Voraussetzungen

- Docker und Compose v2 (getestet: Docker 29.4, Compose 5.1). SSH-Schlüssel für GitHub auf der VM (wie bei v2).
- Plattenplatz: Der Build braucht vorübergehend einige GB. Vorher `docker system df` ansehen, danach `docker builder prune -f`
  (der Cache war bei der ersten Einrichtung 13 GB groß).
- Zugriff nur über den Tailnet-Hostnamen, nie über die IP: Nur der Hostname hat ein gültiges Zertifikat (Pflicht für Web Crypto und WebAuthn).

## Vorschau einrichten

Alle Befehle auf der VM. Code kommt aus `develop` (v3 liegt im Unterordner `v3/`, der Root bleibt v2).

```bash
# 1. Clone (eigenes Verzeichnis, getrennt von v2)
cd ~/docker
git clone -b develop git@github.com:tobiwan24/schmerztagebuch.git schmerztagebuch-v3
cd ~/docker/schmerztagebuch-v3/v3

# 2. .env (bleibt auf der VM, nicht im Git)
cat > .env << 'EOF'
COMPOSE_PROJECT_NAME=schmerztagebuch-v3
RP_ID=ubuntu-docker.tail000296.ts.net
ALLOWED_ORIGINS=https://ubuntu-docker.tail000296.ts.net:8061
WEB_PORT=127.0.0.1:18061
EOF
chmod 600 .env
docker compose config | grep -E "published|RP_ID|ALLOWED|name:"

# 3. Bauen und starten
docker compose build
docker compose up -d
docker compose ps          # web muss 127.0.0.1:18061->80/tcp zeigen (nicht 0.0.0.0)
sleep 5; curl -s http://127.0.0.1:18061/api/v1/health
docker builder prune -f
```

`WEB_PORT=127.0.0.1:18061` funktioniert, weil die Compose-Datei `"${WEB_PORT:-8080}:80"` bindet; eine Override-Datei ist nicht nötig
(ein zusätzliches `ports:` in einer Override-Datei würde die Basis-Einträge ergänzen statt ersetzen).

**Caddy** (`~/docker/caddy/Caddyfile`, direkt unter dem Block für `:8060`):

```
# Schmerztagebuch v3 (Vorschau, parallel zu v2)
ubuntu-docker.tail000296.ts.net:8061 {
    import tailscale_tls
    handle /api/auth/* {
        reverse_proxy localhost:18060
    }
    handle /api/sync/* {
        reverse_proxy localhost:18060
    }
    handle {
        reverse_proxy localhost:18061
    }
}
```

Die zwei `handle`-Zeilen mit `18060` sind die **v2-Brücke** für die Migration (siehe unten). Ohne Migration reicht
`reverse_proxy localhost:18061`. Danach prüfen und neu laden (sanft, kein Neustart):

```bash
cd ~/docker/caddy
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
curl -sk https://ubuntu-docker.tail000296.ts.net:8061/api/v1/health
cd ~/docker && git add caddy/Caddyfile && git commit -m "caddy: Schmerztagebuch v3 Vorschau :8061"
```

## Aktualisieren

```bash
cd ~/docker/schmerztagebuch-v3/v3
git pull && docker compose build && docker compose up -d && docker builder prune -f
```

## v2-Brücke für die Migration

Einträge, die seit dem v2-Cloud-Konto entstanden sind, sind mit dem **v2-Cloud-Schlüssel** verschlüsselt (auch wenn v2 lokal auf
„unverschlüsselt“ steht). Die Migration holt den Schlüssel über den v2-Server (`/api/auth/*`, `/api/sync/*`). Die v2-Pfade
überschneiden sich nicht mit den v3-Pfaden (`/api/v1/*`), deshalb kann Caddy sie nach Pfad auf v2 umleiten (Block oben). v2 hat kein CORS,
eine Adresse auf einem anderen Origin würde der Browser blockieren.

- Auf der Migrationsseite den **v2-Backup-Code** nehmen, nicht den Passkey: Der v2-Server prüft beim Passkey den Origin und kennt nur `:8060`.
- Für die 3 Einträge vom 26.02. (lokal verschlüsselt) das **v2-Passwort** im Feld „Passwort aus v2“ eingeben.

## Umstellung auf Port 8060 (durchgeführt 2026-11-23, Details in GATE-G4.md Schritt 5)

- v3 läuft unter **demselben Origin** wie v2, damit es die lokale `PainDiaryDB` lesen kann.
- Entscheidung D2: Das **bestehende v3-Volume** (`schmerztagebuch-v3_stb-data`) mit Konto, Passkeys und migrierten Daten wurde weiterverwendet.
- `ALLOWED_ORIGINS` im v3-`.env` enthält beide Origins (`RP_ID` unverändert):
  `ALLOWED_ORIGINS=https://ubuntu-docker.tail000296.ts.net:8060,https://ubuntu-docker.tail000296.ts.net:8061`,
  danach `docker compose up -d` (Server-Container neu erstellt, Volume bleibt).
- Caddy-Block `:8060`: `/api/auth/*` und `/api/sync/*` gehen weiter an v2 (`localhost:18060`, der v2-Stack bleibt laufen), alles andere an v3 (`localhost:18061`):

  ```
  ubuntu-docker.tail000296.ts.net:8060 {
      import tailscale_tls
      handle /api/auth/* {
          reverse_proxy localhost:18060
      }
      handle /api/sync/* {
          reverse_proxy localhost:18060
      }
      handle {
          reverse_proxy localhost:18061
      }
  }
  ```

- Tests: `curl -sk https://ubuntu-docker.tail000296.ts.net:8060/api/v1/health` liefert das v3-JSON (`db: true`), `/api/auth/salt?username=__x__` antwortet mit der v2-Meldung `{"error":"not_found"}`, `/api/sync/pull` mit `401`.
- **Stolperstein Caddy-Bind-Mount:** Das Caddyfile ist als **einzelne Datei** in den Container eingebunden. `sed -i` (und manche Editoren) ersetzen die Datei durch einen neuen Inode, der Container sieht dann weiter die alte Version, `caddy validate` und `caddy reload` prüfen und laden die **alte** Konfiguration. Erkennbar daran, dass `docker compose exec caddy sed -n '69,80p' /etc/caddy/Caddyfile` nicht den Host-Stand zeigt. Lösung: `cd ~/docker/caddy && docker compose up -d --force-recreate caddy` (wenige Sekunden Unterbrechung aller Dienste hinter Caddy, Daten und Zertifikate liegen auf dem Host).
- Backup-Hook (`~/scripts/backup-hook.sh`) für v3: Eintrag vorhanden, der erste nächtliche Lauf nach dem Umzug und die Verankerung in Backrest sind zu prüfen. Speicherort der Produktivdaten: lokales Docker-Volume (siehe NFS/WAL unten).
- Rückweg: Caddy-Block zurück auf `reverse_proxy localhost:18060` (Sicherung `/tmp/Caddyfile.bak-8060`), danach `--force-recreate` wie oben; die v2-Datenbank ändert v3 nie (MIG-02).

## Bekannte Probleme und Lösungen (aus der Einrichtung 2026-11-22)

| Symptom | Ursache | Lösung |
|---|---|---|
| „Öffnen“ bei einem Anhang reagiert auf dem iPhone (installierte PWA) nicht | Die App öffnete den Anhang nach einem `await` in einem neuen Fenster (`target="_blank"`); iOS blockiert das stumm. | Anzeige im Dialog in der App: Bilder direkt, PDFs über einen Link „PDF öffnen“ im Dialog (Fingertipp direkt auf dem Link). |
| `502 Bad Gateway` direkt nach `docker compose up` | Der Server braucht nach dem Start noch einige Sekunden (Datenbank einrichten). | 5 bis 10 Sekunden warten, erneut abfragen. Bleibt es: `docker compose logs server`. |
| Anhänge (Fotos) kommen nicht auf dem Server an, auf anderen Geräten „Inhalt nicht verfügbar (noch nicht synchronisiert)“; im nginx-Log `PUT /api/v1/blobs/… 413` und „client intended to send too large body“ | nginx begrenzt Anfragen standardmäßig auf **1 MB** (`client_max_body_size`). Ein 2-MB-Foto ist als Base64 rund 2,7 MB. Der Server erlaubt bis `BLOB_CIPHERTEXT_MAX_CHARS`. | `client_max_body_size` in `apps/web/nginx.conf` auf die Server-Grenze gesetzt (Test prüft Wert und Docker-Test schickt ein großes PUT durch nginx). Nach dem Neubau laufen die wartenden Uploads aus der Warteschlange des Geräts von selbst nach. |
| „Sync-Fehler“ in v3, Anfragen mit 401, kurz nachdem die Migration beim v2-Konto angemeldet hat | v2 und v3 nannten ihr Sitzungs-Cookie beide `stb_session` (Pfad `/`). Cookies kennen keine Ports, und die v2-Anmeldung der Migration (`POST /api/auth/recover`) überschrieb das v3-Cookie. | v3 hat einen eigenen Cookie-Namen (`stb3_session`, A-130). Workaround bei altem Stand: neues Fenster öffnen und mit Passkey neu anmelden, danach nicht erneut bei v2 anmelden. |
| „Dieser Passkey unterstützt keine Verschlüsselung“ beim Anlegen des Passkeys (Backup-Code-Anmeldung auf neuem Gerät) | Die Bitwarden-Erweiterung in Chrome fängt die Passkey-Anfrage ab und liefert die PRF-Erweiterung nicht. Die Meldung erscheint außerdem bei jedem `NotSupportedError` des Browsers. | Privates Fenster (Erweiterung aus) oder die Passkey-Funktion von Bitwarden für die Adresse abschalten. Mit Chrome plus Windows Hello und mit dem iPhone funktioniert es. Der Backup-Code ist auf 5 Versuche je 15 Minuten begrenzt. |
| Migration: „Cloud-Schlüssel fehlt (v2-Anmeldung nötig)“ | Einträge seit dem v2-Cloud-Konto sind mit dem Cloud-Schlüssel verschlüsselt, die Vorschau erreichte den v2-Server nicht. | v2-Brücke in Caddy (siehe oben), auf der Migrationsseite mit v2-Backup-Code anmelden. |
| Migration: „v2-Passwort fehlt“ | Alte Einträge (vor dem Cloud-Konto) sind mit dem lokalen v2-Passwort verschlüsselt. | Passwort im Feld „Passwort aus v2“ eingeben, Trockenlauf wiederholen (Wiederholungen erzeugen keine Dopplungen). |
| Migration: Prüfung „Anhang …: Inhalt fehlt“ | Die Migration schrieb Anhang-Dateien nur für neue oder geänderte Datensätze, die Prüfung verlangte sie für alle. | Korrigiert: fehlende Dateien werden beim Schreiben nachgeschrieben. |
| Import (Mehr → Export → Importieren): „Das ist keine Export-Datei dieser App.“ bei einer v2-Datei | Der Import liest nur v3-Dateien (`.stb.json`, `.stbbackup`). Die Migration war nur verlinkt, wenn am Origin eine v2-Datenbank erkannt wurde. | Button „Von v2 übernehmen (Migration)“ neben dem Import, v2-Dateien werden erkannt und führen zur Migration (`/migrate`). |
| v2: Manuelles Backup liefert auf dem iPhone keine oder eine alte Datei | v2 gibt den Download-Link sofort nach dem Klick frei (`URL.revokeObjectURL` direkt nach `click()` in `src/utils/manualBackup.ts`). | Backup am PC erstellen. v2 wird nicht geändert. |
| Platte der VM fast voll | Build-Cache von Docker. | `docker builder prune -f` nach jedem Build. |
| SQLite auf NFS (`/mnt/data` ist ein NFS-Share, v2 und v3 nutzen WAL) | SQLite warnt, dass WAL über Netzwerk-Dateisysteme nicht zuverlässig ist. | Offen für die Produktivdaten. Die Vorschau nutzt deshalb ein lokales Docker-Volume. |
| Weitere Hürde Firewall | Die geplante Phase-3-Firewall (`homelab/_planning/phase3-netzwerk-haertung-spec.md`) erlaubt nur Ports bis 8060. | Beim Aktivieren der Regeln `8061` (und im Tailscale-ACL) ergänzen. |
