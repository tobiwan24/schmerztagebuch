// Mehr → Tagebücher → „Tagebuch anlegen" (Spec 10, UI-15): Name, Art, Vorlage aus dem Vorlagenkatalog (eigene, RDM-034,
// oder mitgelieferte) oder leer.
// Mit Konto zuerst den Tagebuch-Schlüssel auf dem Server anlegen, dann lokal (wie im Onboarding); local-only: nur lokal.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { createDiary, instantiateCatalogTemplate, keyBetween } from '@stb/core';
import { PageHeader } from '@/components/PageHeader';
import { DiaryStep, TemplateStep, type DiaryChoice, type TemplateChoice } from '@/components/DiarySetup';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { useQuery } from '@/data/useQuery';
import { catalogEntryCopy, saveCopyMedia, useCatalogDeps } from '@/data/template-catalog';
import { deDiaries } from '@/i18n/lazy/diaries';
import { deTemplates } from '@/i18n/lazy/templates';

export function DiaryCreatePage() {
  const auth = useAuth();
  const data = useData();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<DiaryChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const catalogDeps = useCatalogDeps();
  const own = useQuery(async () => {
    const list = await data.diary.listCatalogTemplates();
    return Promise.all(list.map(async (t) => ({ id: t.id, name: t.name, hint: deTemplates.fieldCount((await data.diary.getTemplate(t.id))?.version.blocks.length ?? 0) })));
  }, [data.diary]);

  async function finish(picked: TemplateChoice | null) {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const clock = { now: data.now };
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const diary = createDiary({ id: data.newId(), ...choice, timezone }, clock);
      const copy = picked?.own ? await catalogEntryCopy(catalogDeps, picked.id, diary.id, keyBetween(null, null)) : undefined;
      const template = picked
        ? (copy?.state ?? instantiateCatalogTemplate(picked.id, { id: data.newId(), diaryId: diary.id, order: keyBetween(null, null), newId: data.newId }, clock))
        : undefined;
      await auth.cloud.createDiary(diary.id);
      await data.diary.createDiary(diary, template);
      if (copy) await saveCopyMedia(catalogDeps, copy);
      void navigate('/more/diaries', { replace: true });
    } catch (e) {
      setError(toAuthErrorCode(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={deDiaries.create} back />
      {choice ? <TemplateStep busy={busy || own.status === 'loading'} own={own.status === 'ok' ? own.data : []} onDone={(c) => void finish(c)} /> : <DiaryStep initialName="" onNext={setChoice} />}
      {error ? <AuthErrorNotice code={error} /> : null}
    </>
  );
}
