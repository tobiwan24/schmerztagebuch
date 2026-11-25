// Führt eine DK-Rotation für die App aus (Spec 09, SHR-13): Abhängigkeiten verdrahten, Fortschritt melden, Vormerkung nach dem
// Abschluss löschen. Wird erst bei einer Rotation geladen (Bundle-Budget, QA-02).
import type { StbDb } from '../data/db.js';
import type { CryptoSession } from '../data/crypto-session.js';
import { createFetchTransport } from '../sync/transport.js';
import { createSharingApi, SharingError } from './api.js';
import { rotateDiary, type RotationProgress } from './rotate.js';
import { createRotationApi, RotationApiError } from './rotation-api.js';
import { clearRotationMark } from './rotation-marker.js';

export type RotationUpdate = { status: 'running'; progress?: RotationProgress } | { status: 'done' } | { status: 'failed' } | { status: 'gone' };

export async function executeRotation(
  deps: { db: StbDb; session: CryptoSession; refreshKey: (diaryId: string) => Promise<void>; report: (u: RotationUpdate) => void },
  diaryId: string,
): Promise<void> {
  const { db, session, refreshKey, report } = deps;
  report({ status: 'running' });
  try {
    const sharing = createSharingApi('');
    const outcome = await rotateDiary(
      {
        api: createRotationApi(''), transport: createFetchTransport(''), keys: { ...session.keys, refresh: refreshKey },
        members: async (id) => (await sharing.listMembers(id)).map((m) => ({ principalId: m.principalId, identityPub: m.identityPub })),
        onProgress: (progress) => report({ status: 'running', progress }),
      },
      diaryId,
    );
    if (outcome.status === 'done') {
      await clearRotationMark(db, diaryId);
      report({ status: 'done' });
    } else {
      report({ status: 'failed' });
    }
  } catch (e) {
    // Kein Besitzer mehr / Tagebuch weg: nichts mehr zu rotieren. Sonst bleibt die Vormerkung und der nächste Sync setzt fort.
    if ((e instanceof RotationApiError || e instanceof SharingError) && (e.status === 403 || e.status === 404)) {
      await clearRotationMark(db, diaryId);
      report({ status: 'gone' });
    } else {
      report({ status: 'failed' });
    }
  }
}
