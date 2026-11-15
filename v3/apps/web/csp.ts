// Content-Security-Policy der Web-App (Spec 12 „Sicherheit"): kein `unsafe-inline`/`unsafe-eval`, keine Fremd-Skripte.
// `connect-src`: eigener Server (inkl. v2-API unter demselben Origin) und Open-Meteo; optional eine abweichende v2-Adresse.
// Eine Quelle für Vite-Vorschau (E2E) und nginx (`nginx.conf`, per Test abgeglichen, QA-04).

export const SECURITY_HEADERS_BASE = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), payment=(), usb=()',
} as const;

export function contentSecurityPolicy(extraConnect: string[] = []): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' https://api.open-meteo.com https://archive-api.open-meteo.com${extraConnect.length ? ' ' + extraConnect.join(' ') : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
