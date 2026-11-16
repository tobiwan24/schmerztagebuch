// Datenzugriff der Ansichten: Repositories über der DB des Kontos (Komponenten greifen nie direkt auf Dexie zu, Spec 01).
// Outbox nur beim Konto „Mit Konto" (Spec 04: im Modus local-only wird die Outbox nicht befüllt). Jede lokale Änderung
// meldet sich über `writes` (→ Sync im Hintergrund); `revision` steigt, wenn der Sync fremde Änderungen übernommen hat.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createIdGenerator } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { plainCodec } from './codec/plain';
import { createCodecRegistry, type CodecRegistry } from './codec/registry';
import { createRecordRepository, type RecordRepository } from './repositories/records';
import { createDiaryRepository, type DiaryRepository } from './repositories/diary';
import { createAttachmentRepository, type AttachmentRepository } from './repositories/attachments';
import { createConflictRepository, type ConflictRepository } from './repositories/conflicts';
import { createStamper, type Stamper } from './identity';
import { createWeatherService } from '@/weather/service';

export interface DataApi {
  records: RecordRepository;
  diary: DiaryRepository;
  /** Anhänge: Metadaten + lokaler Inhalt (A-032). */
  attachments: AttachmentRepository;
  /** Konfliktprotokoll (lokal, UI-18). */
  conflicts: ConflictRepository;
  /** Neue UUID v7 (Spec 02). */
  newId: () => string;
  /** HLC-Stempel und Autor für lokale Änderungen. */
  stamper: Stamper;
  now: () => number;
  /** Wetter (Open-Meteo, Geolocation): nach dem Speichern im Hintergrund (BLK-33). */
  weather: ReturnType<typeof createWeatherService>;
  registry: CodecRegistry;
  /** Ereignis `write` nach jeder erfolgreichen lokalen Änderung. */
  writes: EventTarget;
  /** Steigt, wenn sich Daten von außen geändert haben (Pull) — in `useQuery`-Abhängigkeiten aufnehmen. */
  revision: number;
  bumpRevision(): void;
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { db, now, accountMode } = useAuth();
  const [revision, setRevision] = useState(0);
  const bumpRevision = useCallback(() => setRevision((r) => r + 1), []);
  const base = useMemo(() => {
    const registry = createCodecRegistry([plainCodec]);
    const writes = new EventTarget();
    const raw = createRecordRepository(db, { registry, writeCodec: 'plain', clock: { now }, outbox: accountMode === 'cloud-primary' });
    const notify = <T,>(p: Promise<T>) => p.then((v) => (writes.dispatchEvent(new Event('write')), v));
    const records: RecordRepository = {
      ...raw,
      put: (input, opts) => notify(raw.put(input, opts)),
      putMany: (inputs) => notify(raw.putMany(inputs)),
      remove: (id, payload) => notify(raw.remove(id, payload)),
    };
    const { newId } = createIdGenerator({ now });
    return { records, diary: createDiaryRepository(records), attachments: createAttachmentRepository(db, records, { now }), conflicts: createConflictRepository(db, registry, 'plain'), newId, stamper: createStamper(db, { now }, newId), now, registry, writes,
      weather: createWeatherService({ fetchFn: (input, init) => fetch(input, init), geolocation: navigator.geolocation, now }) };
  }, [db, now, accountMode]);
  const api = useMemo<DataApi>(() => ({ ...base, revision, bumpRevision }), [base, revision, bumpRevision]);
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData außerhalb von <DataProvider>');
  return ctx;
}
