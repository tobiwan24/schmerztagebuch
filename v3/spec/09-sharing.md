# 09 — Geteilte Tagebücher

Eine zweite Person (eigenes Konto) kann in einem Tagebuch mitlesen oder mit eintragen — Ende-zu-Ende-verschlüsselt.
Der Server verwaltet nur Mitgliedschaften und verpackte Schlüssel; er kann keinem Mitglied heimlich einen Schlüssel
unterschieben, ohne dass das auffällt.

## Rollen

| Rolle | Einträge | Vorlagen | Tagebuch-Einstellungen, Mitglieder, Intake |
|---|---|---|---|
| `owner` | lesen, anlegen, bearbeiten, löschen | anlegen, bearbeiten, archivieren | ja |
| `editor` | lesen, anlegen, bearbeiten, löschen | — (nur nutzen) | nein — außer eigenen Kurzbefehl-Intake einrichten (08) |
| `viewer` | lesen | — | nein |

- Jedes Tagebuch hat mindestens einen `owner`. Der letzte Owner kann nicht austreten oder herabgestuft werden.
- Rollen werden **serverseitig** bei jedem Push durchgesetzt (Kind des Records + Rolle) und clientseitig im UI gespiegelt.
- Einträge tragen `authorId`; das UI zeigt „erfasst von …" in geteilten Tagebüchern.
- Teilen setzt `cloud-primary` voraus (beide Personen mit Konto).

## Einladung

```
Owner                                Server                         Eingeladene Person
  │ Einladung erzeugen:                │                                 │
  │ secret = 128 Bit Zufall            │                                 │
  │ POST /invitations {diaryId, role,  │                                 │
  │   ciphertext(Name, Rolle) mit      │                                 │
  │   Key aus secret}  ───────────────▶│ speichert (7 Tage, einmalig)     │
  │ Link: /invite#<id>.<secret> ──────────── (Messenger, persönlich) ───▶│
  │                                    │◀─ GET /invitations/:id ──────────│ entschlüsselt Name/Rolle mit secret,
  │                                    │◀─ POST /accept {identityPub,     │ zeigt „Tagebuch X, Rolle Y annehmen?"
  │                                    │      mac = HMAC(secret, pub)} ───│
  │◀── (nächster Sync) Annahme ────────│                                 │
  │ prüft mac mit secret → echt        │                                 │
  │ wrapped_dk = ECDH-Wrap(DK, pub) ──▶│ legt membership an ─────────────▶│ entpackt DK, synchronisiert
```

- Das `secret` steht nur im **URL-Fragment** und erreicht den Server nie. Die HMAC bindet den öffentlichen Schlüssel der
  eingeladenen Person an das Geheimnis: Der Server kann keinen eigenen Schlüssel einschleusen.
- Zusätzlich zeigen beide Seiten eine **Sicherheitsnummer** (Fingerprint): 12 Zifferngruppen aus
  SHA-256(`stb/v3/fingerprint` | sortierte Identity-Public-Keys beider Personen). Vergleich ist optional; nach Vergleich
  kann die Mitgliedschaft als „verifiziert" markiert werden. Ändert sich der Identity-Key eines Mitglieds, wird die
  Markierung entfernt und ein Hinweis angezeigt.
- Einladungen sind widerrufbar, laufen nach 7 Tagen ab und sind nur einmal annehmbar.
- **QR-Einladung** (RDM-032, A-148): Weil iOS Links nie in einer installierten PWA öffnet, kann der Owner die Einladung
  auch als QR-Code mit `<id>.<secret>` zeigen; die eingeladene Person scannt ihn in der App („Einladung scannen“) oder fügt
  Code/Link ein. Angelegt mit `kind: 'qr'` gilt sie nur 10 Minuten; Schließen des QR-Dialogs oder App im Hintergrund
  widerruft sie. Der offene Dialog fragt die Annahme ab und stößt die Bestätigung per Sync sofort an.

## Mitglied entfernen / austreten

- Owner entfernt ein Mitglied → `memberships.revoked_at`. Der Server liefert ab sofort keine Records mehr und nimmt
  keine Pushes an. Lokale Kopien auf den Geräten der entfernten Person bleiben bestehen — das UI sagt das dem Owner vor
  dem Entfernen klar.
- Austreten: Mitglied entfernt sich selbst; lokale Daten dieses Tagebuchs werden auf seinen Geräten gelöscht.
- *(v3.x)* DK-Rotation nach dem Entfernen.

## Server-Endpunkte

| Endpunkt | Beschreibung |
|---|---|
| `POST /api/v1/diaries/:id/invitations` | Einladung anlegen (nur `owner`; optional `kind: 'qr'` = 10 Minuten gültig) |
| `GET /api/v1/invitations/:id` | Chiffretext der Einladung (ohne Auth, rate-limited) |
| `POST /api/v1/invitations/:id/accept` | Annahme mit `identityPub` + `mac` (Auth erforderlich) |
| `POST /api/v1/diaries/:id/members` | Owner bestätigt Annahme mit `wrapped_dk` |
| `PATCH /api/v1/diaries/:id/members/:principalId` | Rolle ändern (nur `owner`) |
| `DELETE /api/v1/diaries/:id/members/:principalId` | entfernen / austreten |
| `DELETE /api/v1/invitations/:id` | widerrufen |

## Erweiterungen v3.x (M22)

- **DK-Rotation:** Beim Entfernen eines Mitglieds oder Sperren eines Geräts rotiert der Owner-Client den DK (`key_epoch` + 1, Details in 03), mit Fortschrittsanzeige; das verbleibende Mitglied synchronisiert weiter, das entfernte bekommt 403 und keine neuen Daten.
  **Protokoll (A-119):** `POST /api/v1/diaries/:id/rotate` (Owner, atomar; Body `fromEpoch`, `wraps[]` genau für die aktiven Mitglieder, `prevDkWrap` = alter DK unter dem neuen) setzt `key_epoch` + 1, ersetzt die Wraps und startet den Zustand „Rotation läuft“. Ab dann gilt: Push und Blob-Upload nur mit der aktuellen Epoche (aus dem Envelope), sonst `409 stale-epoch`; Pull liefert beide Epochen. `GET /api/v1/diaries/:id/rotation` (Mitglieder) liefert Epoche, `prevDkWrap` und die Zahl offener Records/Blobs (Fortschritt, Fortsetzen). Der Owner-Client stellt Records per Push (baseRev) und Blobs per `PUT` (nur Owner, nur während der Rotation ersetzbar) um; `POST /api/v1/diaries/:id/rotate/complete` beendet die Rotation erst, wenn nichts mehr in einer alten Epoche liegt (sonst `409 rotation-incomplete`), und ist idempotent. **Client (A-120):** Die Sitzung hält je Tagebuch aktuellen und vorherigen DK; bei unbekannter Epoche oder `409 stale-epoch` lädt der Client den neuen Wrap (und den vorherigen DK) neu, verschlüsselt neu und sendet erneut; Records unbekannter Epoche werden nie in die Quarantäne geschoben. Die Rotation wird vor dem Entfernen bzw. Sperren vorgemerkt und nach einem Neustart fortgesetzt; die Mitgliederseite zeigt den Fortschritt.
- **Feinere Rechte:** Flag `canEditTemplates` je Mitgliedschaft (Owner erteilt einem Editor „Vorlagen bearbeiten“; der Server erlaubt dann den Push von `template`/`templateVersion`, A-013 je Flag). **Umsetzung (A-121):** Flag nur für Editoren, vom Owner je Mitglied schaltbar (`PATCH …/members/:principalId` `{ canEditTemplates }`); jeder Rollenwechsel setzt es zurück; Tagebuch-Einstellungen, gespeicherte Filter und Dashboards bleiben dem Owner vorbehalten.
- **Hinweis auf neue Einträge:** „n neue Einträge von X“ seit dem letzten Besuch (lokal, kein Push); Tippen führt zum gefilterten Verlauf. **Umsetzung (A-122):** je Tagebuch und Autor eine Zeile auf Start; bestätigt durch Tippen oder „Ausblenden“; Verlauf mit Filter-Chip „Von X“.

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| SHR-01 | Einladungsablauf zwischen zwei Konten (zwei Browser-Kontexte): nach Annahme und Owner-Sync sieht die eingeladene Person alle Einträge. | e2e |
| SHR-02 | Das `secret` taucht in keinem Request an den Server auf (Netzwerk-Mitschnitt). | e2e |
| SHR-03 | Annahme mit vom Server ausgetauschtem `identityPub` (falsche HMAC) wird vom Owner-Client abgelehnt; kein DK-Wrap entsteht. | integration |
| SHR-04 | Sicherheitsnummer ist auf beiden Seiten identisch und ändert sich, wenn sich ein Identity-Key ändert; „verifiziert" wird dann entfernt. | unit |
| SHR-05 | `viewer`-Push wird vom Server mit 403 abgelehnt; `editor` darf Einträge, aber keine Vorlagen pushen. | integration |
| SHR-06 | Letzter Owner kann nicht austreten oder herabgestuft werden. | integration |
| SHR-07 | Entferntes Mitglied erhält keine Records mehr und kann nicht pushen. | integration |
| SHR-08 | Einladung ist nach Ablauf, Widerruf oder erster Annahme nicht mehr annehmbar. | integration |
| SHR-09 | Konkurrierende Bearbeitung desselben Eintrags durch zwei Personen wird nach den Merge-Regeln (04) zusammengeführt. | e2e |
| SHR-10 | „Erfasst von" zeigt in geteilten Tagebüchern den richtigen Autor. | e2e |
| SHR-11 | Austreten löscht die lokalen Daten des Tagebuchs auf dem Gerät des Mitglieds. | integration |
| SHR-12 | Einladung per Messenger an ein echtes zweites iPhone angenommen, beide tragen ein, beide sehen alles. | manual |
| SHR-13 | Mitglied entfernen → Rotation mit Fortschritt; das verbleibende Mitglied synchronisiert weiter; das entfernte bekommt 403 und keine neuen Daten. | e2e |
| SHR-14 | Owner erteilt einem Editor „Vorlagen bearbeiten“ → Editor kann den Vorlagen-Editor nutzen, der Server erlaubt den Push von `template`/`templateVersion` (A-013 je Flag). | e2e |
| SHR-15 | Start zeigt „3 neue Einträge von X“ seit dem letzten Besuch; Tippen führt zum gefilterten Verlauf. | e2e |
| SHR-16 | Rotation mit zwei echten Geräten/Konten. | manual |
| SHR-17 | QR-Einladung (`kind: 'qr'`) ist nach 10 Minuten nicht mehr abruf- oder annehmbar, Link-Einladungen gelten weiter 7 Tage; unbekannte Art → 400. | integration |
| SHR-18 | Einladungscode wird als Code, Fragment oder ganzer Link erkannt; ein erzeugter QR-Code wird vom Leser wieder als derselbe Code gelesen. | unit |
| SHR-19 | QR-Einladung zwischen zwei Konten: Dialog zeigt QR-Code, eingeladene Person löst den Code in der App ein, der Dialog meldet den Beitritt; Schließen des Dialogs widerruft eine nicht angenommene Einladung. | e2e |
| SHR-20 | QR-Code mit der installierten App auf einem echten zweiten iPhone gescannt und angenommen. | manual |
