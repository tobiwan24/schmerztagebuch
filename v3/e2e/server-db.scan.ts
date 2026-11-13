// CRY-15: Nach einem vollständigen E2E-Durchlauf enthält die Server-DB keine Klartext-Marker aus Testeinträgen.
// Läuft als Playwright-Projekt nach allen anderen (playwright.config.ts) und liest die DB des E2E-Servers direkt.
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { test, expect } from '@playwright/test';

const DB = fileURLToPath(new URL('../reports/e2e-server/stb.db', import.meta.url));
/** Inhalte, die in E2E-Tests als Eintrags-, Vorlagen- oder Blocktext auf Konto-Geräten vorkommen. */
const MARKERS = ['STB-E2E-MARKER', 'Startnotiz', 'Migräne', 'Schmerzstärke', 'Allgemeines Schmerz', 'Schmerzlokalisation', 'Notizen', 'Mein Tagebuch'];

test('CRY-15: Server-DB enthält nach dem E2E-Durchlauf keine Klartext-Marker aus Testeinträgen (alle Tabellen)', () => {
  expect(existsSync(DB), 'E2E-Server-DB fehlt').toBe(true);
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    expect(tables).toEqual(expect.arrayContaining(['records', 'users', 'user_keys', 'memberships', 'devices']));
    // Der Scan muss echte Daten sehen, sonst ist er wertlos: Konto-Tests haben Records hochgeladen.
    expect((db.prepare('SELECT COUNT(*) AS n FROM records').get() as { n: number }).n).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const t of tables) {
      const dump = JSON.stringify(db.prepare(`SELECT * FROM "${t}"`).all());
      for (const m of MARKERS) if (dump.includes(m)) hits.push(`${t}: ${m}`);
    }
    expect(hits).toEqual([]);
  } finally {
    db.close();
  }
});
