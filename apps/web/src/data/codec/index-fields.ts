/**
 * Index-Feld `occurredAt` je Codec (A-093): Bei `aes` steht im Index nur der Tag (`YYYY-MM-DD`), die genaue Uhrzeit
 * liegt ausschließlich im verschlüsselten Payload. Alle anderen Codecs behalten den vollen Zeitstempel.
 */
export function indexOccurredAt(codecId: string, occurredAt: string | undefined): string | undefined {
  if (occurredAt === undefined) return undefined;
  return codecId === 'aes' ? occurredAt.slice(0, 10) : occurredAt;
}
