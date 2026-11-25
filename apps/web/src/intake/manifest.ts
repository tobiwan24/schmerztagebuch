// Kurzbefehl-Manifest hochladen (FEAT-023, A-153): die App baut das Manifest aus den Vorlagen des Tagebuchs, versiegelt es mit
// dem Token des jeweiligen Intake-Schlüssels und lädt das Siegel nur hoch, wenn sich der Hash gegenüber dem letzten Upload ändert.
import { buildShortcutBundle, manifestHash, quickEntrySelection, type TemplateState } from '@stb/core';
import { sealManifest, type ManifestSeal } from '@stb/crypto';
import type { DiaryRepository } from '../data/repositories/diary.js';
import type { RecordRepository } from '../data/repositories/records.js';
import type { IntakeKeyRecord } from './setup.js';

export interface ManifestApi {
  uploadManifest(diaryId: string, serverKeyId: string, seal: ManifestSeal): Promise<void>;
}

export interface SyncManifestsDeps {
  api: ManifestApi;
  records: RecordRepository;
  diary: DiaryRepository;
  diaryId: string;
}

/** Lädt das Manifest für jeden aktiven Schlüssel mit Token hoch, dessen Stand vom aktuellen abweicht. */
export async function syncManifests(deps: SyncManifestsDeps): Promise<{ uploaded: number }> {
  const keys = await deps.records.list(deps.diaryId, 'intakeKey');
  if (!keys.some((r) => (r.payload as IntakeKeyRecord).token)) return { uploaded: 0 };
  const d = await deps.diary.getDiary(deps.diaryId);
  if (!d) return { uploaded: 0 };
  const states = (await Promise.all((await deps.diary.listTemplates(d.id)).map((t) => deps.diary.getTemplate(t.id)))).filter((s): s is TemplateState => !!s);
  const bundle = buildShortcutBundle(d.name, states, quickEntrySelection(d, states)?.state.template.id);
  const hash = manifestHash(bundle);
  const bytes = new TextEncoder().encode(JSON.stringify(bundle));
  let uploaded = 0;
  for (const r of keys) {
    const key = r.payload as IntakeKeyRecord;
    if (!key.token || key.manifestHash === hash) continue;
    try {
      await deps.api.uploadManifest(deps.diaryId, key.serverKeyId, await sealManifest(key.token, deps.diaryId, bytes));
    } catch {
      continue; // z. B. offline oder Schlüssel serverseitig widerrufen — beim nächsten Sync erneut
    }
    await deps.records.put({ id: r.id, diaryId: deps.diaryId, kind: 'intakeKey', payload: { ...key, manifestHash: hash } satisfies IntakeKeyRecord });
    uploaded++;
  }
  return { uploaded };
}
