// Schlüsselepoche eines Chiffretexts (Spec 03 Envelope: version[1] | keyEpoch[4, BE] | …). Der Server sieht nur diese fünf Bytes
// und prüft damit, dass nur mit der aktuellen Epoche geschrieben wird (M22, CRY-22). Er kann den Chiffretext nicht lesen und
// verlässt sich nicht auf dessen Inhalt: nicht erkennbare Formate gelten als Epoche 1 (wie vor der Rotation; ein Tagebuch mit
// höherer Epoche lehnt sie damit ab).
const HEAD = /^[A-Za-z0-9_-]{8}/;

export function envelopeEpoch(ciphertext: string): number {
  if (!HEAD.test(ciphertext)) return 1;
  const raw = Buffer.from(ciphertext.slice(0, 8), 'base64url');
  if (raw.length < 5 || raw[0] !== 1) return 1;
  return raw.readUInt32BE(1);
}
