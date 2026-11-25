# 11 — Migration v2 → v3

v3 läuft unter derselben Adresse wie v2 und liest die v2-Datenbank `PainDiaryDB` direkt im Browser. Die v2-Daten
werden dabei **nie verändert oder gelöscht** — sie bleiben als Rückfallebene liegen, bis der User sie ausdrücklich
entfernt.

## Ausgangslage (v2)

- Dexie `PainDiaryDB`, Schema **v21**: `templates`, `entries` (Daten als JSON-String, ggf. verschlüsselt), `settings`.
- Verschlüsselung: Modi `none | history | full`; Formate v1 (`salt|iv|ct`, PBKDF2 pro Eintrag) und v2 (`iv|ct`,
  Sitzungsschlüssel aus `appSalt`); bei Cloud-Sync zusätzlich `encryptionSource: 'cloud'` mit dem v2-Cloud-DEK.
- Cloud-DEK: nur über den v2-Server erhältlich (Passkey-PRF-Login → `wrapped_dek_passkey`, oder Backup-Code →
  `wrapped_dek_backup`).
- Der User nutzt v2-Cloud-Sync. Auf einem Gerät können daher Einträge fehlen, die nur auf einem anderen Gerät oder dem
  v2-Server liegen.

## Quellen (in dieser Reihenfolge angeboten)

1. **Lokale `PainDiaryDB`** auf dem aktuellen Gerät (Standard).
2. **v2-Server-Pull** (read-only): nach v2-Login werden alle Einträge vom v2-Server geholt und mit den lokalen
   zusammengeführt (über `syncId`, neueste `updatedAt` gewinnt — wie v2). Dadurch fehlt nichts, auch wenn das Gerät
   nicht aktuell war.
3. **v2-Backup-Datei** (`manualBackup`-Format, auch Dateien aus `fix/v2-backup-merge`).

## Ablauf (Assistent unter `/migrate`)

1. **Erkennen:** Beim ersten Start von v3 wird `PainDiaryDB` geöffnet (nur lesend, ohne Dexie-Schema-Upgrade:
   `new Dexie('PainDiaryDB')` ohne `version()`-Deklaration → dynamischer Modus) und gezählt.
2. **Entsperren:** je nach gefundenen Formaten v2-Passwort (lokal) und/oder v2-Cloud-Login (Passkey oder v2-Backup-Code).
   Die v2-Entschlüsselung wird **nur lesend** nach `apps/web/src/migration/v2/` portiert (v1-/v2-Format, Cloud-DEK).
3. **Optional v2-Server-Pull** (Quelle 2).
4. **Transformieren** (pure Funktionen in `packages/core/migration-v2/`):
   - v2-Vorlage → v3-`Template` + `TemplateVersion 1` im Tagebuch „Ich" (oder vom User gewähltes Tagebuch).
     Blöcke bekommen neue UUID-v7-IDs; eine Mapping-Tabelle `v2BlockId → v3BlockId` wird im Migrationsbericht gespeichert.
   - Legacy-`image`-Blöcke → `textarea` mit Anhang (wie v2-Auto-Migration).
   - Multiselect-Werte (Labels/Indizes) → Options-IDs; unbekannte Werte → neue Option „(aus v2) …".
   - Body-Map: normalisierte Koordinaten übernehmen, `presetId` zuordnen.
   - Einträge, deren Vorlage sich in v2 geändert hat (ISS-014-Fälle), bekommen eine **eigene Vorlagenversion**, die die
     damals vorhandenen Blöcke abbildet, statt Werte umzudeuten.
   - Event-/Arzttermin-Daten der Textarea übernehmen; Zeitstempel mit der Gerätezeitzone als Tagebuch-Zeitzone.
   - v2-Datum-Block (Pflicht in jeder v2-Vorlage) wird kein v3-Block: `single` → `occurredAt` (Datum + Uhrzeit, ohne
     Uhrzeit 12:00 lokal), `range` → `period` (Datum bzw. Zeitpunkte, wenn Uhrzeiten gesetzt) und `occurredAt` = Beginn.
   - Gelöschte v2-Einträge (`deleted`) werden nicht übernommen.
   - `meta.source = 'migration-v2'`; Wetter wird **nicht** nachträglich ermittelt (optional: Schalter „Wetter für
     migrierte Einträge nachtragen" über die Archiv-API).
5. **Trockenlauf-Bericht:** Anzahl Vorlagen/Einträge/Anhänge, nicht entschlüsselbare Einträge (mit Datum), unbekannte
   Werte, Warnungen. Nichts wird geschrieben, bevor der User bestätigt.
6. **Schreiben** über die Repositories (Outbox → Sync zum v3-Server in `cloud-primary`). Idempotent: deterministische
   v3-IDs aus `v2:syncId` (UUID v7 mit Zeitstempel aus `createdAt` + Hash-Zufallsteil), sodass ein Wiederholungslauf
   keine Duplikate erzeugt.
7. **Prüfen:** Abgleich Anzahl und Stichproben-Inhalt (alle Werte jedes 10. Eintrags) zwischen v2-Quelle und v3.
   Bericht wird als Datei angeboten und in v3 gespeichert.
8. **Abschluss:** Flag `migratedFromV2At`; v2-Daten bleiben. In Einstellungen: „v2-Daten von diesem Gerät entfernen"
   (mit Bestätigung, erst nach erfolgreicher Prüfung möglich).

## Ablösung (Gate G4, Meilenstein M13)

Checkliste, die der User vor der Umstellung abhakt (in `PROGRESS.md`):

1. Auf jedem v2-Gerät letzter Sync in v2 durchgeführt.
2. v2-Backup-Datei auf dem Hauptgerät exportiert und extern gesichert.
3. Migration in einer Vorschau-Umgebung mit einer Kopie der echten Daten erfolgreich (Bericht ohne Fehler).
4. v3-Server läuft im Homelab, Backup des v3-Servers eingerichtet.
5. Deployment umstellen (01) → auf dem Hauptgerät migrieren → auf weiteren Geräten v3 anmelden (Daten kommen per Sync).
6. v2-Server nach 30 Tagen ohne Bedarf abschalten.

## Akzeptanztests

| ID | Kriterium | Ebene |
|---|---|---|
| MIG-01 | v3 erkennt eine `PainDiaryDB` (Fixture: echter, anonymisierter v21-Dump) und zählt Vorlagen/Einträge korrekt. | integration |
| MIG-02 | Öffnen der v2-DB verändert sie nicht (Byte-Vergleich aller Stores vorher/nachher, Schema-Version bleibt 21). | integration |
| MIG-03 | Entschlüsselung aller drei v2-Varianten (v1-Format, v2-Format, Cloud-DEK) mit Fixture-Daten gelingt; falsches Passwort → `wrong-password`. | unit |
| MIG-04 | Transformation: Fixture mit allen v2-Blocktypen ergibt gültige v3-Daten (zod) mit den erwarteten Werten (Golden File). | unit |
| MIG-05 | Legacy-`image`-Blöcke werden zu `textarea` mit Anhang. | unit |
| MIG-06 | Einträge mit geänderter v2-Vorlage (ISS-014-Fixture) bekommen eine passende eigene Vorlagenversion; kein Wert wird einem falschen Block zugeordnet. | unit |
| MIG-07 | Multiselect: bekannte Labels → Options-IDs; unbekannte → neue Option „(aus v2) …". | unit |
| MIG-08 | Trockenlauf schreibt nichts in `stb-v3`. | integration |
| MIG-09 | Zweiter Migrationslauf erzeugt keine Duplikate (deterministische IDs). | integration |
| MIG-10 | Prüfschritt meldet eine absichtlich manipulierte Abweichung (fehlender Eintrag) als Fehler. | integration |
| MIG-11 | v2-Server-Pull (gegen einen v2-Server-Stub mit Fixture-Antworten) ergänzt Einträge, die lokal fehlen, und wählt bei Doppelungen die neuere `updatedAt`. | integration |
| MIG-12 | v2-Backup-Datei als Quelle ergibt dasselbe Ergebnis wie die gleiche lokale DB. | integration |
| MIG-13 | Nicht entschlüsselbare Einträge erscheinen im Bericht mit Datum und blockieren die übrigen nicht. | integration |
| MIG-14 | „v2-Daten entfernen" ist erst nach erfolgreichem Prüfschritt möglich und verlangt Bestätigung. | e2e |
| MIG-15 | End-to-End: v2-Fixture-DB im Browser → Assistent → Einträge in Verlauf sichtbar, PDF-Export enthält migrierte Einträge. | e2e |
| MIG-16 | Migration der echten Daten auf dem Hauptgerät, Stichprobe durch den User bestätigt. | manual |
| MIG-17 | v2 `hideLabelInDiary` wird zu `hideLabel: true` am Block der passenden Vorlagenversion. | unit |
