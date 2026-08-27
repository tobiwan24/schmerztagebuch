// Zeilen-Typen exakt nach Spec-Abschnitt "Datenmodell-Mapping".

export interface UserRow {
  id: number;
  username: string;
  kdf_salt: string;
  backup_auth_hash: string | null;
  wrapped_dek_backup: string | null;
  backup_code_created_at: string | null;
  created_at: string;
}

export interface CredentialRow {
  id: number;
  user_id: number;
  credential_id: string;
  public_key: Buffer;
  sign_count: number;
  wrapped_dek_passkey: string;
  device_label: string | null;
  created_at: string;
}

export interface TemplateRow {
  user_id: number;
  sync_id: string;
  name: string | null;
  order: number | null;
  icon: string | null;
  color: string | null;
  blocks: string | null;
  updated_at: string;
  deleted: number;
  server_seq: number;
}

export interface EntryRow {
  user_id: number;
  sync_id: string;
  template_sync_id: string | null;
  timestamp: string | null;
  edited_at: string | null;
  tags: string | null;
  encrypted: number;
  data: string | null;
  updated_at: string;
  deleted: number;
  server_seq: number;
}

// Push-Payload-Form für ein einzelnes Record (Client -> Server), sowohl für
// templates als auch entries. `syncId`/`updatedAt`/`deleted` sind laut Spec
// (API-Grobdesign) auf jedem Push-Record vorhanden; der Rest ist
// tabellenspezifisches, für den Server opakes Payload.
export interface TemplatePushRecord {
  syncId: string;
  updatedAt: string;
  deleted: boolean;
  name?: string;
  order?: number;
  icon?: string;
  color?: string;
  blocks?: string;
}

export interface EntryPushRecord {
  syncId: string;
  updatedAt: string;
  deleted: boolean;
  templateSyncId?: string;
  timestamp?: string;
  editedAt?: string;
  tags?: string[];
  encrypted?: boolean;
  data?: string;
}

export interface TemplateSyncRecord {
  syncId: string;
  name: string | null;
  order: number | null;
  icon: string | null;
  color: string | null;
  blocks: string | null;
  updatedAt: string;
  deleted: boolean;
}

export interface EntrySyncRecord {
  syncId: string;
  templateSyncId: string | null;
  timestamp: string | null;
  editedAt: string | null;
  tags: string[];
  encrypted: boolean;
  data: string | null;
  updatedAt: string;
  deleted: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId?: number;
  }
}
