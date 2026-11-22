// Rollenvorschläge der KI im Vorlagen-Editor (Spec 05/08, BLK-53): Antworten sind nie vertrauenswürdig und nur Entwürfe.
import type { BlockDef, Role, TemplateVersion } from '@stb/core';
import type { LlmRolesResponse } from '@stb/sync-protocol';

export interface RoleSuggestion {
  blockId: string;
  label: string;
  role: Role;
  reason?: string;
}

/**
 * Prüft die Antwort gegen den Editor-Stand: unbekannte Blöcke, Blöcke mit bereits dieser Rolle und doppelte Vorschläge
 * (der erste gilt) werden verworfen.
 */
export function usableSuggestions(blocks: readonly BlockDef[], response: LlmRolesResponse): RoleSuggestion[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const out: RoleSuggestion[] = [];
  for (const s of response.suggestions) {
    const block = byId.get(s.blockId);
    if (!block || seen.has(s.blockId) || block.role === s.role) continue;
    seen.add(s.blockId);
    out.push({ blockId: s.blockId, label: block.label, role: s.role, ...(s.reason ? { reason: s.reason } : {}) });
  }
  return out;
}

/** Setzt die Rolle eines Blocks (genau ein Block, übrige unverändert). */
export function withRole(blocks: BlockDef[], blockId: string, role: Role): BlockDef[] {
  return blocks.map((b) => (b.id === blockId ? ({ ...b, role } as BlockDef) : b));
}

/** Der gesendete Inhalt als Text für den Freigabedialog: Bezeichnungen und Beschreibungen, keine Einträge. */
export function rolesPreview(blocks: readonly BlockDef[]): string {
  return blocks.map((b) => (b.description ? `${b.label} (${b.description})` : b.label)).join('\n');
}

/** Pseudo-Version für die Anfrage (der Server liest nur die Blöcke). */
export function draftVersion(templateId: string, blocks: BlockDef[], now: string): TemplateVersion {
  return { templateId, version: 1, blocks, createdAt: now };
}
