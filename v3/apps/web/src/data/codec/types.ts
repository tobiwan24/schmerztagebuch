/** Kontext eines Datensatzes; bei verschlüsselnden Codecs Teil der AAD (Spec 03). */
export interface CodecContext {
  diaryId: string;
  kind: string;
  recordId: string;
}

/**
 * Einzige Stelle, an der `payload`/`base` (de)kodiert werden (Spec 02). v3.0 schreibt `plain`; lokale
 * Verschlüsselung (v3.x) ist ein weiterer Codec, das Feld `codec` pro Record erlaubt gemischte Bestände.
 */
export interface PayloadCodec {
  readonly id: string;
  encode(obj: unknown, ctx: CodecContext): Promise<unknown>;
  decode(raw: unknown, ctx: CodecContext): Promise<unknown>;
}
