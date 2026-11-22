// Server-Konfiguration ausschließlich über Umgebungsvariablen, beim Start mit zod validiert (Spec 01).
import { z } from 'zod';

const envSchema = z.object({
  RP_ID: z.string().trim().min(1),
  ALLOWED_ORIGINS: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean))
    .pipe(z.array(z.url()).min(1)),
  DATABASE_PATH: z.string().trim().min(1),
  BLOB_DIR: z.string().trim().min(1),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  // Rate-Limits (Spec 03): Anmeldung pro IP und Minute, Recovery pro IP bzw. Benutzername und 15 Minuten.
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(30),
  RECOVERY_RATE_LIMIT_PER_15MIN: z.coerce.number().int().min(1).default(5),
  // LLM (Spec 08, M19): Standard aus; Schlüssel bzw. URL müssen zum gewählten Provider passen.
  LLM_PROVIDER: z.enum(['off', 'ollama', 'anthropic']).default('off'),
  LLM_DAILY_TOKENS: z.coerce.number().int().min(1).default(50_000),
  OLLAMA_URL: z.string().trim().optional(),
  OLLAMA_MODEL: z.string().trim().min(1).default('qwen2.5:7b-instruct'),
  ANTHROPIC_API_KEY: z.string().trim().optional(),
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-opus-5-5'),
}).superRefine((e, ctx) => {
  if (e.LLM_PROVIDER === 'ollama' && !z.url().safeParse(e.OLLAMA_URL).success) {
    ctx.addIssue({ code: 'custom', path: ['OLLAMA_URL'], message: 'URL erforderlich bei LLM_PROVIDER=ollama' });
  }
  if (e.LLM_PROVIDER === 'anthropic' && !e.ANTHROPIC_API_KEY) {
    ctx.addIssue({ code: 'custom', path: ['ANTHROPIC_API_KEY'], message: 'erforderlich bei LLM_PROVIDER=anthropic' });
  }
});

export interface LlmConfig {
  provider: 'off' | 'ollama' | 'anthropic';
  dailyTokens: number;
  ollamaUrl?: string;
  ollamaModel: string;
  anthropicApiKey?: string;
  anthropicModel: string;
}

export interface ServerConfig {
  rpId: string;
  allowedOrigins: string[];
  databasePath: string;
  blobDir: string;
  port: number;
  host: string;
  /** Optional (Standard 30 / 5); Tests setzen höhere Werte. */
  rateLimits?: { authPerMinute: number; recoveryPer15Min: number };
  /** Optional; ohne Angabe ist das LLM aus. */
  llm?: LlmConfig;
}

export class ConfigError extends Error {
  constructor(readonly variables: string[], message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Validiert die Umgebung; meldet **alle** fehlenden/ungültigen Variablen auf einmal. */
export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const r = envSchema.safeParse(env);
  if (!r.success) {
    const vars = [...new Set(r.error.issues.map((i) => String(i.path[0])))];
    const lines = r.error.issues.map((i) => `  ${String(i.path[0])}: ${env[String(i.path[0])] === undefined ? 'fehlt' : i.message}`);
    throw new ConfigError(vars, `Ungültige Server-Konfiguration:\n${lines.join('\n')}\nSiehe apps/server/.env.example`);
  }
  const e = r.data;
  return {
    rpId: e.RP_ID, allowedOrigins: e.ALLOWED_ORIGINS, databasePath: e.DATABASE_PATH, blobDir: e.BLOB_DIR, port: e.PORT, host: e.HOST,
    rateLimits: { authPerMinute: e.AUTH_RATE_LIMIT_PER_MIN, recoveryPer15Min: e.RECOVERY_RATE_LIMIT_PER_15MIN },
    llm: {
      provider: e.LLM_PROVIDER, dailyTokens: e.LLM_DAILY_TOKENS, ollamaModel: e.OLLAMA_MODEL, anthropicModel: e.ANTHROPIC_MODEL,
      ...(e.OLLAMA_URL ? { ollamaUrl: e.OLLAMA_URL } : {}), ...(e.ANTHROPIC_API_KEY ? { anthropicApiKey: e.ANTHROPIC_API_KEY } : {}),
    },
  };
}

/** Minimaler `.env`-Parser (KEY=VALUE, Kommentare mit #, optionale Anführungszeichen). */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}
