// Client-SDK für Integrationen (Spec 03/07, M24, ARC-08, A-094/A-127): nur lesend.
//   1. Zugangsstring prüfen (Prüfsumme) und lesen → Token, Integrationsschlüssel, Tagebuch, optional Server-Adresse.
//   2. `sync()` zieht per `GET /api/v1/integration/records` den Chiffretext seitenweise (Cursor wird erst nach dem
//      Anwenden der Seite weitergesetzt), entpackt den DK mit dem Integrationsschlüssel und entschlüsselt die Records.
//   3. `snapshot()` liefert Tagebuch, Vorlagen, Vorlagenversionen und Einträge typisiert (zod-Schemas aus `core`);
//      Records, die sich nicht entschlüsseln oder prüfen lassen, stehen unter `skipped` — nie als geratene Werte.
// Der Server sieht nur Chiffretext; Klartext entsteht ausschließlich hier im Prozess der Integration.
import {
  diarySchema,
  entrySchema,
  templateSchema,
  templateVersionSchema,
  type Diary,
  type Entry,
  type Template,
  type TemplateVersion,
} from '@stb/core';
import { decryptRecord, parseAccessString, parseEnvelope, unwrapDkForMember, type IntegrationAccess, type MemberDkWrap } from '@stb/crypto';
import { integrationRecordsResponseSchema, type IntegrationRecordsResponse } from '@stb/sync-protocol';

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface IntegrationClientOptions {
  /** Zugangsstring (`stbi1.…`), wie ihn die App einmal anzeigt. */
  accessString: string;
  /** Server-Adresse; überschreibt die im Zugangsstring enthaltene. */
  baseUrl?: string;
  fetch?: FetchLike;
  /** Records je Anfrage (1–500, Standard 500). */
  pageSize?: number;
  signal?: AbortSignal;
}

export type SdkErrorCode =
  /** Token unbekannt oder widerrufen (z. B. nach einer Schlüsselrotation). */
  | 'unauthenticated'
  | 'rate-limited'
  | 'forbidden'
  | 'no-base-url'
  | 'bad-response'
  | 'server-error'
  | 'network';

export class IntegrationApiError extends Error {
  constructor(
    readonly code: SdkErrorCode,
    message: string,
    readonly status?: number,
    /** Bei `rate-limited`: Wartezeit in Sekunden (Header `retry-after`). */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'IntegrationApiError';
  }
}

export interface SkippedRecord {
  recordId: string;
  kind: string;
  reason: 'decrypt-failed' | 'epoch-mismatch' | 'invalid';
}

export interface DiarySnapshot {
  diary: Diary | undefined;
  templates: Template[];
  versions: TemplateVersion[];
  /** Nach `occurredAt` aufsteigend. */
  entries: Entry[];
  skipped: SkippedRecord[];
}

export interface SyncSummary {
  /** Neu geladene Records (inkl. gelöschter). */
  fetched: number;
  /** Davon nicht entschlüsselbar (Schema-Fehler zeigt erst `snapshot().skipped`). */
  skipped: number;
  /** Anzahl Anfragen (Seiten). */
  pages: number;
}

export interface IntegrationClient {
  readonly diaryId: string;
  /** Zieht alle neuen Records seit dem letzten Lauf. Fehler brechen ab; der Cursor bleibt auf der letzten angewendeten Seite. */
  sync(): Promise<SyncSummary>;
  snapshot(): DiarySnapshot;
}

interface Stored {
  kind: string;
  payload: unknown;
}

/** Meldet sich an: Zugangsstring prüfen und lesen (Prüfsumme, Format). Netzwerk erst bei `sync()`. */
export async function connectIntegration(options: IntegrationClientOptions): Promise<IntegrationClient> {
  const access = await parseAccessString(options.accessString);
  const baseUrl = (options.baseUrl ?? access.origin)?.replace(/\/$/, '');
  if (!baseUrl) throw new IntegrationApiError('no-base-url', 'Server-Adresse fehlt: im Zugangsstring ist keine enthalten, `baseUrl` angeben');
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  return createClient(access, baseUrl, doFetch, options.pageSize ?? 500, options.signal);
}

function createClient(access: IntegrationAccess, baseUrl: string, doFetch: FetchLike, pageSize: number, signal: AbortSignal | undefined): IntegrationClient {
  const state = new Map<string, Stored>();
  const skipped = new Map<string, SkippedRecord>();
  let cursor = 0;
  let dk: { wrap: string; epoch: number; key: CryptoKey } | undefined;

  async function fetchPage(since: number): Promise<IntegrationRecordsResponse> {
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await doFetch(`${baseUrl}/api/v1/integration/records?since=${since}&limit=${pageSize}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${access.token}` },
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      throw new IntegrationApiError('network', e instanceof Error ? e.message : 'Netzwerkfehler');
    }
    if (res.status === 401) throw new IntegrationApiError('unauthenticated', 'Zugang unbekannt oder widerrufen — in der App einen neuen Zugang anlegen', 401);
    if (res.status === 403) throw new IntegrationApiError('forbidden', 'Zugriff verweigert', 403);
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after'));
      throw new IntegrationApiError('rate-limited', 'Zu viele Anfragen', 429, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    if (!res.ok) throw new IntegrationApiError('server-error', `Server antwortete mit ${res.status}`, res.status);
    const parsed = integrationRecordsResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new IntegrationApiError('bad-response', 'Unerwartete Antwort des Servers');
    if (parsed.data.diaryId !== access.diaryId) throw new IntegrationApiError('bad-response', 'Antwort gehört zu einem anderen Tagebuch');
    return parsed.data;
  }

  async function diaryKey(page: IntegrationRecordsResponse): Promise<{ key: CryptoKey; epoch: number }> {
    if (dk && dk.wrap === page.wrappedDk && dk.epoch === page.keyEpoch) return { key: dk.key, epoch: dk.epoch };
    const key = await unwrapDkForMember(JSON.parse(page.wrappedDk) as MemberDkWrap, access.keyPair, { diaryId: access.diaryId, keyEpoch: page.keyEpoch });
    dk = { wrap: page.wrappedDk, epoch: page.keyEpoch, key };
    return { key, epoch: page.keyEpoch };
  }

  async function apply(page: IntegrationRecordsResponse): Promise<number> {
    const { key, epoch } = await diaryKey(page);
    let bad = 0;
    for (const r of page.records) {
      skipped.delete(r.recordId);
      if (r.deleted) {
        state.delete(r.recordId);
        continue;
      }
      const skip = (reason: SkippedRecord['reason']) => {
        state.delete(r.recordId);
        skipped.set(r.recordId, { recordId: r.recordId, kind: r.kind, reason });
        bad++;
      };
      try {
        const recordEpoch = parseEnvelope(r.ciphertext).keyEpoch;
        if (recordEpoch !== epoch) {
          skip('epoch-mismatch');
          continue;
        }
        const plain = await decryptRecord(key, { diaryId: access.diaryId, kind: r.kind, recordId: r.recordId, keyEpoch: recordEpoch }, r.ciphertext);
        state.set(r.recordId, { kind: r.kind, payload: JSON.parse(new TextDecoder().decode(plain)) as unknown });
      } catch {
        skip('decrypt-failed');
      }
    }
    return bad;
  }

  return {
    diaryId: access.diaryId,
    async sync() {
      const summary: SyncSummary = { fetched: 0, skipped: 0, pages: 0 };
      for (;;) {
        const page = await fetchPage(cursor);
        summary.pages++;
        summary.skipped += await apply(page);
        summary.fetched += page.records.length;
        cursor = page.nextSince; // erst nach dem Anwenden der Seite
        if (!page.hasMore) return summary;
      }
    },
    snapshot() {
      const out: DiarySnapshot = { diary: undefined, templates: [], versions: [], entries: [], skipped: [...skipped.values()] };
      const invalid = (recordId: string, kind: string) => out.skipped.push({ recordId, kind, reason: 'invalid' });
      for (const [recordId, { kind, payload }] of state) {
        const parse = <T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): T | undefined => {
          const r = schema.safeParse(payload);
          if (!r.success) invalid(recordId, kind);
          return r.success ? r.data : undefined;
        };
        if (kind === 'diary') out.diary = parse<Diary>(diarySchema) ?? out.diary;
        else if (kind === 'template') push(out.templates, parse<Template>(templateSchema));
        else if (kind === 'templateVersion') push(out.versions, parse<TemplateVersion>(templateVersionSchema));
        else if (kind === 'entry') push(out.entries, parse<Entry>(entrySchema));
      }
      out.entries.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id < b.id ? -1 : 1));
      return out;
    },
  };
}

function push<T>(list: T[], v: T | undefined): void {
  if (v !== undefined) list.push(v);
}
