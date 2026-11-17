#!/usr/bin/env node
// Startpunkt (stdio): `STB_ACCESS_STRING` (Zugangsstring aus Einstellungen → Integrationen), optional `STB_BASE_URL`.
// stdout gehört dem Protokoll — Meldungen gehen nach stderr, nie Token oder Daten.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { connectIntegration } from '@stb/client-sdk';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  const accessString = process.env['STB_ACCESS_STRING'];
  if (!accessString) {
    process.stderr.write('STB_ACCESS_STRING fehlt (Zugangsstring aus Einstellungen → Integrationen).\n');
    process.exitCode = 2;
    return;
  }
  const baseUrl = process.env['STB_BASE_URL'];
  const client = await connectIntegration({ accessString, ...(baseUrl ? { baseUrl } : {}) });
  await createMcpServer({ client }).connect(new StdioServerTransport());
}

main().catch((e: unknown) => {
  process.stderr.write(`Start fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannter Fehler'}\n`);
  process.exitCode = 1;
});
