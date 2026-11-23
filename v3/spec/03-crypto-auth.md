# 03 — Krypto, Auth, Geräte

## Algorithmen (nur WebCrypto)

| Zweck | Verfahren |
|---|---|
| Datenverschlüsselung | AES-GCM-256, 96-Bit-IV zufällig, AAD siehe unten |
| Schlüsselverpackung symmetrisch | AES-KW-256 |
| Schlüsselableitung aus Material | HKDF-SHA-256 mit Domain-Separation (`info`-Strings, siehe Tabelle) |
| Passwort (nur `local-only`) | PBKDF2-SHA-256, **600.000** Iterationen, 16-Byte-Salt |
| Asymmetrisch (Teilen, Intake; v3.x Integrationen) | ECDH P-256 (ephemer-statisch) → HKDF → AES-KW bzw. AES-GCM |
| Signaturen (Fingerprints, Einladungen) | ECDSA P-256 / SHA-256 |
| Passkey-Material | WebAuthn PRF-Extension, fester Eval-Salt pro Zweck |

`info`-Strings (Konstanten in `packages/crypto/src/domains.ts`):
`stb/v3/umk-wrap/passkey`, `stb/v3/umk-wrap/backup`, `stb/v3/umk-wrap/password`, `stb/v3/dk-wrap/ecdh`,
`stb/v3/share`, `stb/v3/device-local`, `stb/v3/intake`, `stb/v3/fingerprint`.

## Schlüsselhierarchie

```
Passkey-PRF ─┐
Backup-Code ─┼─(HKDF/PBKDF2)→ KEK ─(AES-KW)→ UMK (User Master Key, 256 Bit, zufällig)
Passwort* ───┘                                   │
                                                 ├─ verschlüsselt → Identity-Private-Keys (ECDH + ECDSA)
                                                 │
Identity-ECDH-Pub (Mitglied/Integration) ─(ECDH+HKDF+AES-KW)→ DK (Diary Key, pro Tagebuch, mit key_epoch)
                                                                 │
                                                                 └─ AES-GCM → Records, Blobs
* Passwort nur im Modus local-only oder als zusätzlicher Faktor
```

- **UMK** verlässt das Gerät nie unverpackt. Der Server speichert nur Wraps.
- **DK** pro Tagebuch; pro Mitglied/Integration ein eigener Wrap (`memberships.wrapped_dk`).
- **Backup-Code**: 128 Bit Zufall, Base32 in 8er-Gruppen, Pflicht bei Cloud-Registrierung und bei local-only,
  einmalig angezeigt + als Datei herunterladbar. Ableitung über PBKDF2 (600k) — Server speichert nur einen
  Verifier (separat abgeleitet, eigene `info`).

## Envelope-Format (alle Chiffretexte)

```
Ciphertext = base64url( version[1] | keyEpoch[4, BE] | iv[12] | gcm-ciphertext+tag )
AAD        = utf8("stb/v3|" + diaryId + "|" + kind + "|" + recordId + "|" + keyEpoch)
```

Die AAD bindet den Chiffretext an Datensatz und Tagebuch: Ein vom Server vertauschter oder in ein anderes Tagebuch
kopierter Datensatz lässt sich nicht entschlüsseln.

## Abläufe

| Ablauf | Beschreibung |
|---|---|
| **Registrierung (cloud)** | Passkey mit PRF anlegen → UMK erzeugen → mit KEK_passkey verpacken → Identity-Keys erzeugen, mit UMK verschlüsseln → Backup-Code erzeugen + verpacken → erstes Tagebuch + DK anlegen → alles hochladen. Kein Überspringen des Backup-Codes. |
| **Einrichtung (local-only)** | Faktor wählen: Passkey-PRF (lokal, ohne Server-Verifikation) **oder** Passwort. UMK + Backup-Code wie oben, nur lokal. |
| **Entsperren** | Optionen werden **beim Öffnen** des Entsperr-Dialogs vorgeladen; der Klick löst unmittelbar `navigator.credentials.get()` aus (keine `await`s davor — iOS-User-Geste). PRF → KEK → UMK → Identity-Keys → DKs. |
| **Sitzung** | Entschlüsselte Schlüssel nur im Speicher. Da lokale Daten in v3.0 unverschlüsselt liegen (02), ist die App-Sperre ein UI-Schutz (Ansichten gesperrt, Schlüssel verworfen), kein Schutz gegen Zugriff auf den Gerätespeicher. Option „Auf diesem Gerät entsperrt bleiben": UMK wird mit einem **nicht-extrahierbaren** Device-Key (in IndexedDB) verpackt; Ablauf nach einstellbarer Dauer (1–30 Tage, Standard 7), sofort widerrufbar. Inaktivitäts-Sperre einstellbar (Aus/5/15/30/60 min, Standard 30). Faktorverwaltung (Passwort ändern, Passkey hinzufügen/entfernen, Backup-Code erneuern) in den Einstellungen (CRY-18), Geräteliste mit Abmelden/Sperren (CRY-19). |
| **Gerät hinzufügen** | Neues Gerät meldet sich mit (synchronisiertem) Passkey an — oder per Backup-Code — und registriert ggf. eigenen Passkey (zusätzlicher UMK-Wrap). |
| **Recovery** | Backup-Code → UMK → danach Pflicht: neuen Passkey registrieren und neuen Backup-Code anzeigen. |
| **Gerät sperren** | v3.0: `revoked_at` setzen → Server liefert diesem Gerät keine Records mehr und nimmt keine Pushes an; die Sitzung wird beendet. *(v3.x: zusätzlich DK-Rotation mit neuer `key_epoch` und Re-Verschlüsselung im Hintergrund durch einen Owner-Client.)* |
| **Abbruch** | Jeder Entsperr-Dialog hat einen sichtbaren Weg zurück: ohne Entsperrung sind gesperrte Bereiche nicht zugänglich, der Dialog ist aber **jederzeit erneut erreichbar** (Banner + Einstellungen). Kein „Später" als Sackgasse. |

## Fehlermeldungen (verbindlich unterscheidbar)

`webauthn-cancelled`, `webauthn-not-allowed` (z. B. Geste verloren), `prf-unsupported`, `no-credential`,
`server-unreachable`, `challenge-expired`, `wrong-backup-code`, `wrong-password`, `unwrap-failed`.
Jeder Code hat einen deutschen, handlungsorientierten Text. Fehler werden nie zu einem generischen `false` reduziert.

## Server-Auth

- WebAuthn mit `userVerification: 'required'`, `residentKey: 'required'`.
- Challenges in SQLite mit TTL 5 min (überleben Neustart), pro Challenge-ID statt pro Username (Doppel-Tap-sicher).
- Session-Cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, Laufzeit 30 Tage, rotierend.
- Kurzbefehle authentifizieren sich am Intake-Endpunkt mit einem Intake-Token pro Tagebuch (Hash serverseitig, 08).
- *(v3.x)* Integrationen authentifizieren sich mit API-Token (Hash serverseitig) — Token gibt nur Zugriff auf Chiffretext.
- Rate-Limits auf Auth- und Recovery-Endpunkten.

## Erweiterungen v3.x

- **DK-Rotation (M22):** Beim Entfernen eines Mitglieds oder Sperren eines Geräts erzeugt der Owner-Client DK′ (`key_epoch` + 1), verpackt ihn für die verbleibenden Mitglieder und verschlüsselt alle Records im Hintergrund neu, fortsetzbar und idempotent. Lesen akzeptiert während der Rotation beide Epochen, Push nur noch mit der neuen. Das entfernte Mitglied bekommt keinen Wrap der neuen Epoche.
- **Integrationen (M24):** Eine Integration ist ein Principal (`devices.kind = 'integration'`) mit eigenem ECDH-Schlüssel; der Owner verpackt den DK dafür. Token und Integrationsschlüssel werden einmal als ein String (mit Prüfsumme) angezeigt, der Server speichert nur den Token-Hash. Nur lesende API (Chiffretext, Spec 07).

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| CRY-01 | Verschlüsseln/Entschlüsseln-Roundtrip für Records mit korrekter AAD gelingt. | unit |
| CRY-02 | Entschlüsselung schlägt fehl, wenn `recordId`, `diaryId`, `kind` oder `keyEpoch` in der AAD abweichen. | unit |
| CRY-03 | Envelope enthält Version und keyEpoch; unbekannte Version wird mit klarer Fehlermeldung abgelehnt. | unit |
| CRY-04 | UMK-Wrap/Unwrap mit Passkey-PRF-KEK, Backup-Code-KEK und Passwort-KEK funktioniert; falscher Faktor → `unwrap-failed`. | unit |
| CRY-05 | DK lässt sich per ECDH für ein zweites Schlüsselpaar verpacken und nur von diesem entpacken. | unit |
| CRY-06 | PBKDF2 nutzt ≥ 600.000 Iterationen (Konstante getestet). | unit |
| CRY-07 | Backup-Code hat 128 Bit Entropie, Format Base32-Gruppen, Prüfung tolerant gegenüber Leerzeichen/Kleinschreibung. | unit |
| CRY-08 | Registrierung ohne Bestätigung des Backup-Codes ist nicht abschließbar. | e2e |
| CRY-09 | Entsperren mit virtuellem Authenticator (PRF) entsperrt Daten; zwischen Klick und `credentials.get()` liegt kein `await` (Unit-Test des Handlers mit Spy). | e2e |
| CRY-10 | Nach Abbruch des Entsperr-Dialogs ist der Dialog über Banner und Einstellungen erneut erreichbar; gesperrte Views bleiben gesperrt. | e2e |
| CRY-11 | Jeder Fehlercode aus der Liste erzeugt einen eigenen UI-Text (Snapshot pro Code). | unit |
| CRY-12 | „Entsperrt bleiben": nach Reload ohne Passkey entsperrt; nach Ablauf bzw. Widerruf wieder gesperrt; Device-Key ist nicht extrahierbar (`extractable === false`). | integration |
| CRY-13 | Server-Challenge überlebt Server-Neustart innerhalb der TTL; abgelaufene Challenge → `challenge-expired`. | integration |
| CRY-14 | Gesperrtes Gerät erhält keine Records mehr und kann nicht mehr pushen (DK-Rotation: v3.x). | integration |
| CRY-15 | Server-DB enthält nach einem vollständigen E2E-Durchlauf keine Klartext-Marker aus Testeinträgen (Scan aller Tabellen). | e2e |
| CRY-16 | Recovery mit Backup-Code erzwingt Registrierung eines neuen Passkeys und Anzeige eines neuen Codes. | e2e |
| CRY-17 | Passkey-Login auf echtem iPhone (Face ID, iCloud-Schlüsselbund) inkl. App-Neustart. | manual |
| CRY-18 | Einstellungen → Konto & Sync (Ende der Card): Passwort ändern (local-only; mit aktuellem Faktor, alter Passwort-Wrap danach ungültig), Passkey hinzufügen/entfernen (mindestens ein Faktor außer Backup-Code bleibt), Backup-Code erneuern (neuer Code mit Pflichtbestätigung, alter ungültig; im Konto Wrap + Verifier auf dem Server ersetzt). | e2e |
| CRY-19 | Einstellungen → Geräte (Konto): Liste der eigenen Geräte mit „dieses Gerät"; „Abmelden" beendet die Sitzung und verwirft lokale Schlüssel und Wraps (Daten bleiben bis zum Löschen); anderes Gerät sperren → `revoked_at` (Wirkung wie CRY-14). | e2e |
| CRY-20 | Einstellungen → Sperre: Dauer „entsperrt bleiben" einstellbar (1–30 Tage) und widerrufbar; automatische Sperre nach Inaktivität (Aus/5/15/30/60 min, Standard 30) mit gefälschter Uhr geprüft. | integration |
| CRY-21 | `planDkRotation`/Re-Encrypt-Batches: neue Epoche, Wraps nur für aktive Mitglieder; nach einem Abbruch fortsetzbar, idempotent. | unit |
| CRY-22 | Server `POST /diaries/:id/rotate` (Owner, atomar); ein entferntes Mitglied bekommt keinen Wrap der neuen Epoche; Push mit alter Epoche nach Abschluss → 409. | integration |
| CRY-23 | Schlüssel und DK-Wrap der Integration, Token-Hash, Format des Zugangsstrings mit Prüfsumme. | unit |
| CRY-24 | Server: Tokens anlegen, auflisten, widerrufen (Owner); `GET /api/v1/integration/records?since=` liefert Chiffretext und Wrap; Push → 403; Rate-Limit; Schema-Migration `devices.kind` (CHECK erweitert). | integration |
