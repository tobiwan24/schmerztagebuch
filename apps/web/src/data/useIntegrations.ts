// Integrationen des aktuellen Tagebuchs (EXP-27): Liste, anlegen, widerrufen. Ansichten greifen nur hierüber zu (Spec 01).
import { useCallback } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { createIntegration, listIntegrations, revokeIntegration } from '@/sharing/integrations';
import { useQuery } from './useQuery';

export function useIntegrations(diaryId: string | null) {
  const { session } = useAuth();
  const query = useQuery(async () => (diaryId ? listIntegrations(diaryId, session.umk()) : []), [diaryId, session]);
  const create = useCallback(
    async (name: string) => {
      if (!diaryId) throw new Error('Kein Tagebuch');
      const made = await createIntegration({ diaryId, name, dk: await session.keys.get(diaryId), umk: session.umk(), origin: globalThis.location.origin });
      query.retry();
      return made.accessString;
    },
    [diaryId, session, query],
  );
  const revoke = useCallback(
    async (id: string) => {
      if (!diaryId) return;
      await revokeIntegration(diaryId, id);
      query.retry();
    },
    [diaryId, query],
  );
  return { query, create, revoke };
}
