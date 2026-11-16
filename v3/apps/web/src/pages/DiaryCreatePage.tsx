// Mehr → Tagebücher → „Tagebuch anlegen" (Spec 10, UI-15): Name, Art, Vorlage aus dem Katalog oder leer.
// Mit Konto zuerst den Tagebuch-Schlüssel auf dem Server anlegen, dann lokal (wie im Onboarding); local-only: nur lokal.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { createDiary, instantiateCatalogTemplate, keyBetween } from '@stb/core';
import { PageHeader } from '@/components/PageHeader';
import { DiaryStep, TemplateStep, type DiaryChoice } from '@/components/DiarySetup';
import { AuthErrorNotice } from '@/components/AuthErrorNotice';
import { toAuthErrorCode, type AuthErrorCode } from '@/auth/errors';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';
import { de } from '@/i18n/de';

export function DiaryCreatePage() {
  const auth = useAuth();
  const data = useData();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<DiaryChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);

  async function finish(catalogId: string | null) {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const clock = { now: data.now };
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const diary = createDiary({ id: data.newId(), ...choice, timezone }, clock);
      const template = catalogId
        ? instantiateCatalogTemplate(catalogId, { id: data.newId(), diaryId: diary.id, order: keyBetween(null, null), newId: data.newId }, clock)
        : undefined;
      await auth.cloud.createDiary(diary.id);
      await data.diary.createDiary(diary, template);
      void navigate('/more/diaries', { replace: true });
    } catch (e) {
      setError(toAuthErrorCode(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={de.diaries.create} back />
      {choice ? <TemplateStep busy={busy} onDone={(id) => void finish(id)} /> : <DiaryStep initialName="" onNext={setChoice} />}
      {error ? <AuthErrorNotice code={error} /> : null}
    </>
  );
}
