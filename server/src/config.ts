/**
 * Zentrale Server-Konfiguration aus Umgebungsvariablen.
 *
 * Für den lokalen Test via docker-compose.yml im Repo-Root sind sinnvolle
 * Defaults gesetzt (RP_ID=localhost, ORIGIN=http://localhost:18060). Für den
 * späteren VM-Deploy (Tailnet-Hostname, https) werden diese Werte per
 * docker-compose.override.yml/.env überschrieben (Aufgabe eines anderen
 * Agents, siehe Spec Phase 6 — nicht Teil dieses Worktrees).
 */

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Fehlende Umgebungsvariable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: required('DB_PATH', './data/app.db'),

  // WebAuthn Relying Party
  rpId: required('RP_ID', 'localhost'),
  rpName: required('RP_NAME', 'Schmerztagebuch'),
  // Kommagetrennte Liste erlaubter Origins (Single-Origin-Betrieb -> i.d.R. genau einer)
  allowedOrigins: required('ORIGIN', 'http://localhost:18060')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Session-Cookie
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'stb_session',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),

  // WebAuthn-Challenges (Registrierung/Login) leben nur kurz im Speicher
  challengeTtlMs: Number(process.env.CHALLENGE_TTL_MS ?? 5 * 60 * 1000),

  // Push-Body-Limit laut Spec: 15 MB (Puffer für base64-Anhänge)
  bodyLimitBytes: Number(process.env.BODY_LIMIT_BYTES ?? 15 * 1024 * 1024),
} as const;
