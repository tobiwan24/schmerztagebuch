// Reine Logik der Verlauf-Cards (RDM-028 P3, A-135): Titel, Kennzeichen und Schmerzwert-Ampel eines Eintrags.
import { compareByOrder, type AttachmentMeta, type BlockDef, type Entry } from '@stb/core';

export type PainTone = 'green' | 'amber' | 'orange' | 'red';

export interface EntryCardMeta {
  title?: string;
  flags: { event: boolean; doctor: boolean; bodymap: boolean; image: boolean; pdf: boolean };
  pain?: number;
  painTone?: PainTone;
}

export const CARD_TITLE_MAX = 80;

/** Ampel auf Skala 0–10: ≤3 grün, ≤6 gelb, ≤8 orange, sonst rot. */
export function painToneOf(pain: number): PainTone {
  return pain <= 3 ? 'green' : pain <= 6 ? 'amber' : pain <= 8 ? 'orange' : 'red';
}

const asObj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined);

/**
 * @param blocks Blöcke der Version, mit der der Eintrag erfasst wurde
 * @param currentBlocks Blöcke der aktuellen Vorlagenversion (Rollen können sich später ändern); optional
 * @param attachments Metadaten der Anhänge dieses Eintrags
 */
export function entryCardMeta(
  entry: Pick<Entry, 'values'>,
  blocks: readonly BlockDef[],
  currentBlocks: readonly BlockDef[] | undefined,
  attachments: readonly Pick<AttachmentMeta, 'kind'>[],
): EntryCardMeta {
  const flags = { event: false, doctor: false, bodymap: false, image: attachments.some((a) => a.kind === 'image'), pdf: attachments.some((a) => a.kind === 'pdf') };
  let title: string | undefined;
  const pains: number[] = [];
  const roleOf = (b: BlockDef) => currentBlocks?.find((c) => c.id === b.id)?.role ?? b.role;
  for (const b of [...blocks].sort(compareByOrder)) {
    const v = entry.values[b.id];
    if (v === undefined || v === null) continue;
    if (b.type === 'text' && typeof v === 'string' && !title && v.trim()) title = v.trim();
    if (b.type === 'textarea') {
      const o = asObj(v);
      const text = typeof o?.text === 'string' ? o.text.trim() : '';
      if (!title && text) title = text;
      const events = Array.isArray(o?.events) ? (o.events as { category?: unknown }[]) : [];
      if (events.some((e) => e.category === 'event')) flags.event = true;
      if (events.some((e) => e.category === 'doctor')) flags.doctor = true;
      // Anhang-IDs ohne Metadaten (z. B. Legacy-Bilder aus v2) zählen als Foto.
      if (Array.isArray(o?.attachmentIds) && o.attachmentIds.length > 0 && attachments.length === 0) flags.image = true;
    }
    if (b.type === 'bodymap') {
      const pts = asObj(v)?.points;
      if (Array.isArray(pts) && pts.length > 0) flags.bodymap = true;
    }
    if (b.type === 'slider' && roleOf(b) === 'outcome' && typeof v === 'number' && Number.isFinite(v)) {
      const { min, max } = b.config;
      // Skala mit max 10 (0–10, 1–10): Rohwert; sonst auf 0–10 normieren
      pains.push(max === 10 ? v : ((v - min) / (max - min)) * 10);
    }
  }
  const out: EntryCardMeta = { flags };
  if (title) out.title = title.length > CARD_TITLE_MAX ? `${title.slice(0, CARD_TITLE_MAX)}…` : title;
  if (pains.length > 0) {
    out.pain = Math.round(pains.reduce((a, b) => a + b, 0) / pains.length);
    out.painTone = painToneOf(out.pain);
  }
  return out;
}
