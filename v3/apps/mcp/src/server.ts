// MCP-Server (Spec 07, M24, EXP-28, A-094/A-129): lokal beim Nutzer, nur lesend, auf Basis von `client-sdk`.
// Tools: `list_diaries`, `search_entries`, `get_entry`, `stats`. Der Server schreibt nie — der Integrations-Token erlaubt serverseitig
// nur `GET /api/v1/integration/records` (sonst 403). Klartext entsteht ausschließlich in diesem Prozess.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  addDays, applyFilter, buildWorkingSet, createSearchIndex, dayIn, FEW_DATA_THRESHOLD, periodStats, previousRange,
  type FilterSpec, type NumericTarget, type SearchIndex, type WorkingSet, type WsEntry,
} from '@stb/analysis';
import { ROLES } from '@stb/core';
import { IntegrationApiError, type IntegrationClient } from '@stb/client-sdk';

export interface McpDeps {
  client: Pick<IntegrationClient, 'diaryId' | 'sync' | 'snapshot'>;
  /** Zeit in ms (injizierbar für Tests). */
  now?: () => number;
  /** Mindestabstand zwischen zwei Abgleichen mit dem Server (Standard 30 s). */
  syncIntervalMs?: number;
}

const isoDay = z.iso.date();
const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MAX = 100;
const NOTE = 'Beschreibende Auswertung der eigenen Einträge, keine Diagnose und keine Therapieempfehlung.';

interface Loaded {
  ws: WorkingSet;
  search: SearchIndex;
  timezone: string;
}

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const failure = (message: string) => ({ isError: true as const, content: [{ type: 'text' as const, text: message }] });

function describeError(e: unknown): string {
  if (e instanceof IntegrationApiError) {
    if (e.code === 'unauthenticated') return 'Der Zugang ist ungültig oder wurde widerrufen. Lege in der App unter Einstellungen → Integrationen einen neuen Zugang an.';
    if (e.code === 'rate-limited') return `Zu viele Anfragen${e.retryAfterSec ? `, bitte in ${e.retryAfterSec} s erneut versuchen` : ''}.`;
    if (e.code === 'network') return `Der Server ist nicht erreichbar (${e.message}).`;
    return e.message;
  }
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

const summaryOf = (e: WsEntry) => ({
  id: e.id,
  occurredAt: e.occurredAt,
  day: e.day,
  template: e.templateName,
  tags: e.tags,
  fields: e.fields.map((f) => ({ label: f.label, ...(f.role ? { role: f.role } : {}), value: f.display })),
});

export function createMcpServer(deps: McpDeps): McpServer {
  const now = deps.now ?? (() => Date.now());
  const interval = deps.syncIntervalMs ?? 30_000;
  let lastSync = -Infinity;
  let loaded: Loaded | null = null;

  /** Gleicht (höchstens alle `interval` ms) mit dem Server ab und liefert Arbeitsset und Suchindex. */
  async function load(): Promise<Loaded> {
    if (!loaded || now() - lastSync >= interval) {
      const summary = await deps.client.sync();
      lastSync = now();
      if (!loaded || summary.fetched > 0) {
        const snap = deps.client.snapshot();
        const timezone = snap.diary?.settings.timezone ?? 'UTC';
        const ws = buildWorkingSet({
          entries: snap.entries, templates: snap.templates, versions: snap.versions,
          diaries: snap.diary ? [{ id: snap.diary.id, settings: { timezone } }] : [],
        });
        loaded = { ws, search: loaded ? loaded.search : createSearchIndex(ws), timezone };
        loaded.search.sync(ws);
      }
    }
    return loaded;
  }

  const guard = <A>(fn: (args: A) => Promise<ReturnType<typeof json>>) => async (args: A) => {
    try {
      return await fn(args);
    } catch (e) {
      return failure(describeError(e));
    }
  };

  const server = new McpServer({ name: 'schmerztagebuch', version: '0.0.0' });
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

  server.registerTool(
    'list_diaries',
    { title: 'Tagebücher auflisten', description: 'Listet das Tagebuch dieses Zugangs mit Vorlagen, Anzahl der Einträge und Zeitraum auf (nur lesend).', annotations: readOnly },
    guard(async () => {
      const l = await load();
      const snap = deps.client.snapshot();
      const days = l.ws.entries.map((e) => e.day).sort();
      return json({
        diaries: snap.diary
          ? [{
              id: snap.diary.id,
              name: snap.diary.name,
              timezone: l.timezone,
              entryCount: l.ws.entries.length,
              firstDay: days[0] ?? null,
              lastDay: days.at(-1) ?? null,
              templates: snap.templates.map((t) => ({ id: t.id, name: t.name, archived: t.archived, purpose: t.purpose ?? 'diary' })),
            }]
          : [],
        notReadable: snap.skipped.length,
      });
    }),
  );

  server.registerTool(
    'search_entries',
    {
      title: 'Einträge suchen',
      description: 'Sucht Einträge nach Text, Zeitraum, Tags und Vorlage. Neueste zuerst; `total` ist die Gesamtzahl der Treffer (nur lesend).',
      inputSchema: {
        text: z.string().trim().min(1).optional().describe('Volltextsuche (Umlaute und Groß/Klein egal)'),
        from: isoDay.optional().describe('Erster Tag (YYYY-MM-DD), nur zusammen mit `to`'),
        to: isoDay.optional().describe('Letzter Tag (YYYY-MM-DD), nur zusammen mit `from`'),
        tags: z.array(z.string().min(1)).optional().describe('Nur Einträge mit mindestens einem dieser Tags'),
        templateId: z.string().min(1).optional().describe('Nur Einträge dieser Vorlage (siehe list_diaries)'),
        limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional().describe(`Höchstens so viele Einträge zurückgeben (Standard ${SEARCH_LIMIT_DEFAULT})`),
      },
      annotations: readOnly,
    },
    guard(async (a: { text?: string; from?: string; to?: string; tags?: string[]; templateId?: string; limit?: number }) => {
      if ((a.from === undefined) !== (a.to === undefined)) return failure('`from` und `to` nur zusammen angeben.');
      if (a.from !== undefined && a.to !== undefined && a.from > a.to) return failure('`from` liegt nach `to`.');
      const l = await load();
      const spec: FilterSpec = {
        diaryIds: [deps.client.diaryId],
        range: a.from !== undefined && a.to !== undefined ? { from: a.from, to: a.to } : { preset: 'all' },
        ...(a.text ? { text: a.text } : {}),
        ...(a.tags?.length ? { tags: { mode: 'any' as const, values: a.tags } } : {}),
        ...(a.templateId ? { templateIds: [a.templateId] } : {}),
      };
      const hits = applyFilter(l.ws, spec, { now: now(), search: (t) => l.search.search(t) });
      const limit = a.limit ?? SEARCH_LIMIT_DEFAULT;
      return json({ total: hits.length, returned: Math.min(hits.length, limit), entries: hits.slice(0, limit).map(summaryOf) });
    }),
  );

  server.registerTool(
    'get_entry',
    {
      title: 'Eintrag lesen',
      description: 'Liefert einen Eintrag vollständig: alle Felder mit Beschriftung und Wert, Tags, Quelle und Wetter (nur lesend).',
      inputSchema: { id: z.string().min(1).describe('ID des Eintrags (aus search_entries)') },
      annotations: readOnly,
    },
    guard(async (a: { id: string }) => {
      const l = await load();
      const e = l.ws.byId.get(a.id);
      if (!e) return failure(`Kein Eintrag mit der ID ${a.id}.`);
      return json({
        ...summaryOf(e),
        source: e.source,
        hasAttachment: e.hasAttachment,
        weather: e.weather,
        fields: e.fields.map((f) => ({ label: f.label, type: f.type, ...(f.role ? { role: f.role } : {}), value: f.display, ...(f.optionLabels.length ? { options: f.optionLabels } : {}) })),
      });
    }),
  );

  server.registerTool(
    'stats',
    {
      title: 'Kennzahlen',
      description: `Kennzahlen eines numerischen Werts (Rolle, Standard outcome = Schmerzstärke) über einen Zeitraum im Vergleich zum Zeitraum davor: Anzahl Tage mit Wert (n), Mittelwert, Median, Minimum, Maximum. ${NOTE}`,
      inputSchema: {
        role: z.enum(ROLES).optional().describe('Rolle des Blocks, Standard outcome'),
        blockId: z.string().min(1).optional().describe('Alternativ: ein bestimmter Block (statt role)'),
        from: isoDay.optional().describe('Erster Tag (Standard: 29 Tage vor `to`)'),
        to: isoDay.optional().describe('Letzter Tag (Standard: heute im Zeitraum des Tagebuchs)'),
        threshold: z.number().finite().optional().describe('Schwelle: zählt Tage mit Tageswert ≥ Schwelle'),
      },
      annotations: readOnly,
    },
    guard(async (a: { role?: (typeof ROLES)[number]; blockId?: string; from?: string; to?: string; threshold?: number }) => {
      const l = await load();
      const to = a.to ?? dayIn(now(), l.timezone);
      const from = a.from ?? addDays(to, -29);
      if (from > to) return failure('`from` liegt nach `to`.');
      const target: NumericTarget = a.blockId ? { blockId: a.blockId } : { role: a.role ?? 'outcome' };
      const opts = a.threshold === undefined ? {} : { threshold: a.threshold };
      const range = { from, to };
      const current = periodStats(l.ws.entries, target, range, opts);
      const before = previousRange(range);
      const previous = periodStats(l.ws.entries, target, before, opts);
      return json({
        target,
        range,
        current,
        previousRange: before,
        previous,
        fewData: current.n < FEW_DATA_THRESHOLD || previous.n < FEW_DATA_THRESHOLD,
        note: NOTE,
      });
    }),
  );

  return server;
}
