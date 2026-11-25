import { describe, expect, it } from 'vitest';
import { ATTACHMENT_MAX_BYTES, checkAttachmentFile } from './attachment.js';

describe('Anhang-Dateien prüfen', () => {
  it('BLK-30: Bild und PDF werden mit ihrer Art angenommen', () => {
    expect(checkAttachmentFile({ mime: 'image/jpeg', sizeBytes: 1000 })).toEqual({ ok: true, kind: 'image' });
    expect(checkAttachmentFile({ mime: 'image/png', sizeBytes: 0 })).toEqual({ ok: true, kind: 'image' });
    expect(checkAttachmentFile({ mime: 'application/pdf', sizeBytes: ATTACHMENT_MAX_BYTES })).toEqual({ ok: true, kind: 'pdf' });
  });

  it('BLK-30: über 20 MB, andere Typen und SVG werden abgelehnt', () => {
    expect(checkAttachmentFile({ mime: 'application/pdf', sizeBytes: ATTACHMENT_MAX_BYTES + 1 })).toEqual({ ok: false, reason: 'tooLarge' });
    expect(checkAttachmentFile({ mime: 'text/plain', sizeBytes: 10 })).toEqual({ ok: false, reason: 'type' });
    expect(checkAttachmentFile({ mime: 'image/svg+xml', sizeBytes: 10 })).toEqual({ ok: false, reason: 'type' });
    expect(checkAttachmentFile({ mime: '', sizeBytes: 10 })).toEqual({ ok: false, reason: 'type' });
  });
});
