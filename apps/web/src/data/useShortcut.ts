// Kurzbefehl je Tagebuch (Spec 08): Intake einrichten/widerrufen (nur mit Konto), Prompt für den Kurzbefehl,
// Zwischenablage-Weg (auch local-only) und Eingang. Ansichten greifen nur hierüber zu (Spec 01).
import { useCallback } from 'react';
import { buildShortcutPrompt, quickEntrySelection, type TemplateState } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { createIntakeApi } from '@/intake/api';
import { setupIntake, type IntakeKeyRecord } from '@/intake/setup';
import { draftFromText, entryFromDraft, type ShortcutDraft } from '@/intake/draft';
import type { IntakeInboxItem } from '@/intake/pickup';
import { useData } from './DataContext';
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

  const info = useQuery(async () => {
    const d = await diary.getDiary(diaryId);
    if (!d) return null;
    const states = await templateStates(diary, diaryId);
    const quick = quickEntrySelection(d, states);
    const mode = (await db.sync_state.get(diaryId))?.mode ?? 'local-only';
    const keys = (await records.list(diaryId, 'intakeKey')).map((r) => r.payload as IntakeKeyRecord).map((k) => ({ id: k.id, serverKeyId: k.serverKeyId, createdBy: k.createdBy, createdAt: k.createdAt }));
    const template = quick?.state ?? null;
    return {
      diary: d,
      cloud: mode === 'cloud-primary',
      keys,
      template,
      prompt: template ? buildShortcutPrompt(template.template.name, template.version) : null,
      endpoint: `${globalThis.location?.origin ?? ''}/api/v1/intake/${diaryId}`,
    };
  }, [diary, records, db, diaryId]);

  const setup = useCallback(async () => {
    const { userId } = await stamper.identity();
    const r = await setupIntake({ api, records, diaryId, createdBy: userId, newId, now });
    info.retry();
    return r.token;
  }, [records, diaryId, stamper, newId, now, info]);

  const revoke = useCallback(
    async (key: { id: string; serverKeyId: string }) => {
      await api.revoke(diaryId, key.serverKeyId);
      await records.remove(key.id);
      info.retry();
    },
    [diaryId, records, info],
  );

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

  return { info, setup, revoke, draft, saveDraft };
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
