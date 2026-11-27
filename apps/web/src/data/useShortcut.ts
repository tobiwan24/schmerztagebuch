// Kurzbefehl je Tagebuch (Spec 08): Intake einrichten/widerrufen (nur mit Konto), Zugangsdaten für den Kurzbefehl,
// Zwischenablage-Weg (auch local-only) und Eingang. Ansichten greifen nur hierüber zu (Spec 01).
import { useCallback } from 'react';
import { quickEntrySelection, shortcutWarnings, updateDiarySettings, type ShortcutAsk, type TemplateState } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { createIntakeApi } from '@/intake/api';
import { syncManifests } from '@/intake/manifest';
import { setupIntake, type IntakeKeyRecord } from '@/intake/setup';
import { draftFromText, entryFromDraft, type ShortcutDraft } from '@/intake/draft';
import type { IntakeInboxItem } from '@/intake/pickup';
import { useData } from './DataContext';
import { useSync } from './SyncContext';
import { useQuery } from './useQuery';

const api = createIntakeApi('');

async function templateStates(diary: ReturnType<typeof useData>['diary'], diaryId: string): Promise<TemplateState[]> {
  const list = await diary.listTemplates(diaryId);
  return (await Promise.all(list.map((t) => diary.getTemplate(t.id)))).filter((s): s is TemplateState => !!s);
}

export function useShortcut(diaryId: string) {
  const { db } = useAuth();
  const data = useData();
  const { diary, records, stamper, newId, now } = data;
  const { syncNow } = useSync();

  const info = useQuery(async () => {
    const d = await diary.getDiary(diaryId);
    if (!d) return null;
    const states = await templateStates(diary, diaryId);
    const quick = quickEntrySelection(d, states);
    const mode = (await db.sync_state.get(diaryId))?.mode ?? 'local-only';
    const keyRecords = (await records.list(diaryId, 'intakeKey')).map((r) => r.payload as IntakeKeyRecord);
    const keys = keyRecords.map((k) => ({ id: k.id, serverKeyId: k.serverKeyId, createdBy: k.createdBy, createdAt: k.createdAt }));
    const endpoint = `${globalThis.location?.origin ?? ''}/api/v1/intake/${diaryId}`;
    // Zugangsdaten für die eine Importfrage des Kurzbefehls: Adresse und Token des neuesten Schlüssels mit Token.
    const newest = keyRecords.filter((k) => k.token).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const shortcutEntries = (await diary.listEntries(diaryId)).filter((e) => e.meta.source === 'shortcut').map((e) => e.recordedAt).sort();
    const template = quick?.state ?? null;
    // Problematische Felder je angebotener Vorlage (FEAT-024; gleiche Auswahl wie das Manifest: aktiv, ohne Training).
    const warnings = states
      .filter((s) => !s.template.archived && s.template.purpose !== 'training')
      .map((s) => ({ templateId: s.template.id, name: s.template.name, items: shortcutWarnings(s.template.name, s.version) }))
      .filter((w) => w.items.length > 0);
    return {
      diary: d,
      warnings,
      ask: d.settings.shortcutAsk ?? ('all' as ShortcutAsk),
      cloud: mode === 'cloud-primary',
      keys,
      template,
      endpoint,
      connection: newest ? JSON.stringify({ url: endpoint, token: newest.token }) : null,
      lastShortcutEntryAt: shortcutEntries.at(-1) ?? null,
    };
  }, [diary, records, db, diaryId]);

  const setup = useCallback(async () => {
    const { userId } = await stamper.identity();
    const r = await setupIntake({ api, records, diaryId, createdBy: userId, newId, now });
    // Manifest sofort hochladen (FEAT-023); gelingt das nicht, holt es der nächste Sync nach.
    await syncManifests({ api, records, diary, diaryId }).catch(() => null);
    info.retry();
    return r.token;
  }, [records, diary, diaryId, stamper, newId, now, info]);

  const revoke = useCallback(
    async (key: { id: string; serverKeyId: string }) => {
      await api.revoke(diaryId, key.serverKeyId);
      await records.remove(key.id);
      info.retry();
    },
    [diaryId, records, info],
  );

  /** Tagebuch-Option „Nachfragen“ (FEAT-024) speichern; das geänderte Manifest wird sofort hochgeladen. */
  const setAsk = useCallback(
    async (ask: ShortcutAsk) => {
      const current = await diary.getDiary(diaryId);
      if (!current) return;
      const s = await stamper.stamp();
      await diary.saveDiary(updateDiarySettings(current, { shortcutAsk: ask }, { hlc: s.hlc, updatedAt: s.at }));
      await syncManifests({ api, records, diary, diaryId }).catch(() => null);
      info.retry();
    },
    [diary, diaryId, stamper, records, info],
  );

  /** Testschritt: Sync anstoßen (holt Kurzbefehl-Items ab) und den Stand neu lesen. */
  const checkArrival = useCallback(async () => {
    await syncNow();
    info.retry();
  }, [syncNow, info]);

  const draft = useCallback(
    (text: string) => draftFromText(text, diary, info.status === 'ok' ? info.data?.template?.template.id : undefined),
    [diary, info],
  );

  const saveDraft = useCallback(
    async (d: ShortcutDraft, inboxId?: string) => {
      const [{ hlc, authorId }, dia] = await Promise.all([stamper.stamp(), diary.getDiary(diaryId)]);
      const entry = entryFromDraft(d, { id: newId(), diaryId, authorId, timezone: dia?.settings.timezone ?? 'UTC', now: now(), hlc });
      await diary.saveEntry(entry);
      if (inboxId) await records.remove(inboxId);
      return entry.id;
    },
    [stamper, diary, diaryId, newId, now, records],
  );

  return { info, setup, revoke, setAsk, checkArrival, draft, saveDraft };
}

/** Eingang (Spec 08): Kurzbefehl-Items, aus denen kein Eintrag entstehen konnte. */
export function useInbox() {
  const { records } = useData();
  const items = useQuery(async () => (await records.listKind('intakeInbox')).map((r) => r.payload as IntakeInboxItem), [records]);
  const discard = useCallback(
    async (id: string) => {
      await records.remove(id);
      items.retry();
    },
    [records, items],
  );
  return { items, discard };
}
