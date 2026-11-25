# Deployment auf VM 100 (Homelab)

Stand: 2026-11-25 · v3 ist die einzige Version (v2 abgeschaltet und entfernt, RDM-036, A-152). Die Infrastruktur-Fakten
(Ports, Caddy, Backup) stehen zusätzlich im Homelab-Repo: `homelab/services/schmerztagebuch.md`, `homelab/ops/network.md`.
Die Ablösung von v2 (Gate G4) beschreibt [GATE-G4.md](GATE-G4.md).

## Überblick

```
Tailscale (nur Tailnet, kein Port-Forwarding)
   │ https (Tailscale-Zertifikat)
   ▼
Caddy (Host-Netzwerk, TLS)  ──►  nginx (`web`, statische PWA, /api/ → server)  ──►  Node-Server (`server`, SQLite + Blobs in /data)
```

| | |
|---|---|
| Adresse | `https://ubuntu-docker.tail000296.ts.net:8060` (`:8061` bleibt vorerst als zweite Adresse) |
| Host-Port (nur 127.0.0.1) | 18061 |
| Verzeichnis auf der VM | `~/docker/schmerztagebuch-v3/` (Clone von `main`, Compose-Datei in der Wurzel) |
| Compose-Projekt | `schmerztagebuch-v3` |
| Daten | lokales Docker-Volume `schmerztagebuch-v3_stb-data` |

Der Server-Container hat **keinen** Host-Port, erreichbar ist nur `web` über `127.0.0.1:18061` und Caddy.

## Voraussetzungen

- Docker und Compose v2 (getestet: Docker 29.4, Compose 5.1). SSH-Schlüssel für GitHub auf der VM.
- Plattenplatz: Der Build braucht vorübergehend einige GB. Vorher `docker system df` ansehen, danach `docker builder prune -f`
  (der Cache war bei der ersten Einrichtung 13 GB groß).
- Zugriff nur über den Tailnet-Hostnamen, nie über die IP: Nur der Hostname hat ein gültiges Zertifikat (Pflicht für Web Crypto und WebAuthn).

## Einrichten (Neuinstallation)

Alle Befehle auf der VM. Code kommt aus `main`.

```bash
# 1. Clone
cd ~/docker
git clone -b main git@github.com:tobiwan24/schmerztagebuch.git schmerztagebuch-v3
cd ~/docker/schmerztagebuch-v3

# 2. .env (bleibt auf der VM, nicht im Git)
cat > .env << 'EOF'
COMPOSE_PROJECT_NAME=schmerztagebuch-v3
RP_ID=ubuntu-docker.tail000296.ts.net
ALLOWED_ORIGINS=https://ubuntu-docker.tail000296.ts.net:8060,https://ubuntu-docker.tail000296.ts.net:8061
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

**Caddy** (`~/docker/caddy/Caddyfile`, versioniert im Repo `homelab-docker`):

```
ubuntu-docker.tail000296.ts.net:8060 {
    import tailscale_tls
    reverse_proxy localhost:18061
}

ubuntu-docker.tail000296.ts.net:8061 {
    import tailscale_tls
    reverse_proxy localhost:18061
}
```

Nach Änderungen Caddy neu erzeugen (Stolperstein Bind-Mount, siehe unten): `cd ~/docker/caddy && docker compose up -d --force-recreate caddy`,
dann `curl -sk https://ubuntu-docker.tail000296.ts.net:8060/api/v1/health`.

## Aktualisieren

```bash
cd ~/docker/schmerztagebuch-v3
git pull && docker compose build && docker compose up -d && docker builder prune -f
```

**Wichtig:** immer in `~/docker/schmerztagebuch-v3` (Wurzel des Clones). Bis 2026-11-25 lag v3 im Unterordner `v3/`; dort liegt
nichts mehr. Ein `docker compose up` in einem anderen Ordner mit eigener Compose-Datei kann unter dem Projektnamen
`schmerztagebuch-v3` fremde Container starten und den v3-Container `web` ersetzen (so am 2026-11-25 passiert).

## v2-Brücke für die Migration (entfallen 2026-11-25, RDM-036)

Bis zur Abschaltung von v2 leitete Caddy `/api/auth/*` und `/api/sync/*` an den v2-Server (`localhost:18060`), damit die
Migration den v2-Cloud-Schlüssel holen konnte. v2 ist abgeschaltet und vom Server entfernt: Die Migration kann keinen
v2-Cloud-Schlüssel mehr holen. Lokale v2-Daten (`PainDiaryDB` auf dem Gerät) bleiben über `/migrate` übernehmbar.

## Umstellung auf Port 8060 (durchgeführt 2026-11-23, Details in GATE-G4.md Schritt 5)

- v3 läuft unter **demselben Origin** wie v2, damit es die lokale `PainDiaryDB` lesen kann.
- Entscheidung D2: Das **bestehende v3-Volume** (`schmerztagebuch-v3_stb-data`) mit Konto, Passkeys und migrierten Daten wurde weiterverwendet.
- `ALLOWED_ORIGINS` im v3-`.env` enthält beide Origins (`RP_ID` unverändert).
- **Stolperstein Caddy-Bind-Mount:** Das Caddyfile ist als **einzelne Datei** in den Container eingebunden. `sed -i` (und manche Editoren) ersetzen die Datei durch einen neuen Inode, der Container sieht dann weiter die alte Version, `caddy validate` und `caddy reload` prüfen und laden die **alte** Konfiguration. Erkennbar daran, dass `docker compose exec caddy sed -n '69,80p' /etc/caddy/Caddyfile` nicht den Host-Stand zeigt. Lösung: `cd ~/docker/caddy && docker compose up -d --force-recreate caddy` (wenige Sekunden Unterbrechung aller Dienste hinter Caddy, Daten und Zertifikate liegen auf dem Host).
- Backup: `~/scripts/backup-hook.sh` stoppt/startet `schmerztagebuch-v3`, `backup-export.sh` kopiert das Volume `schmerztagebuch-v3_stb-data`.

## v2 abgeschaltet (2026-11-25, RDM-036)

v2-Stack (`~/docker/schmerztagebuch`), Images und Daten (`/mnt/data/schmerztagebuch`) sind entfernt, v2 ist aus Caddy und
den Backup-Skripten genommen. Ältere Stände liegen nur noch in den Restic-Snapshots. Der v2-Code ist aus dem Repo entfernt
(Historie in Git), v3 liegt seitdem in der Repo-Wurzel, `main` ist der Produktionsstand.

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
