// QR-Code für Einladungen (RDM-032, A-148): Erzeugen als SVG-Pfad (`qrcode`) und Lesen aus Kamerabildern (`jsqr`).
// Beide Pakete nur per import(), damit sie nicht im initialen Bundle landen (QA-02).

export interface QrMatrix {
  /** Kantenlänge in Modulen (ohne Ruhezone). */
  size: number;
  /** SVG-Pfad aller dunklen Module, Koordinaten in Modulen. */
  path: string;
}

/** Text → QR-Matrix als SVG-Pfad (Fehlerkorrektur M). */
export async function qrMatrix(text: string): Promise<QrMatrix> {
  const { create } = (await import('qrcode')).default; // CommonJS-Paket: Vite und Node liefern module.exports als default
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  let path = '';
  for (let r = 0; r < modules.size; r++) {
    for (let c = 0; c < modules.size; c++) if (modules.get(r, c)) path += `M${c} ${r}h1v1h-1z`;
  }
  return { size: modules.size, path };
}

export type QrDecoder = (data: Uint8ClampedArray, width: number, height: number) => string | null;

/** Lädt den QR-Leser einmal; die zurückgegebene Funktion liest einen Frame (RGBA) und liefert den Text oder `null`. */
export async function loadQrDecoder(): Promise<QrDecoder> {
  const jsQR = (await import('jsqr')).default;
  return (data, width, height) => jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}
