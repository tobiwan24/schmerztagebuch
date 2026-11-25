// Überträgt die frühere Schnelleintrag-Einstellung des Tagebuchs in die Vorlage (A-070) — einmalig nach dem Entsperren.
import { useEffect } from 'react';
import { legacyQuickEntryMigration, updateDiarySettings, updateTemplate, type TemplateState } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { useData } from '@/data/DataContext';

export function QuickEntryMigration() {
  const { status } = useAuth();
  const { diary, stamper, now, bumpRevision } = useData();

  useEffect(() => {
    if (status !== 'unlocked') return;
    let cancelled = false;
    void (async () => {
      let changed = false;
      for (const d of await diary.listDiaries()) {
        if (d.settings.quickEntryTemplateId === undefined && d.settings.quickEntryBlockIds === undefined) continue;
        const states = (await Promise.all((await diary.listTemplates(d.id)).map((t) => diary.getTemplate(t.id)))).filter((s): s is TemplateState => s !== undefined);
        const plan = legacyQuickEntryMigration(d, states);
        if (!plan || cancelled) continue;
        if (plan.quickBlockIds) {
          const state = states.find((s) => s.template.id === plan.quickBlockIds!.templateId)!;
          await diary.saveTemplateMeta(updateTemplate(state, { quickBlockIds: plan.quickBlockIds.ids }, { now }).state.template);
        }
        const s = await stamper.stamp();
        await diary.saveDiary(updateDiarySettings(d, { quickEntryTemplateId: null, quickEntryBlockIds: null }, { hlc: s.hlc, updatedAt: s.at }));
        changed = true;
      }
      if (changed && !cancelled) bumpRevision();
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, diary, stamper, now, bumpRevision]);

  return null;
}
