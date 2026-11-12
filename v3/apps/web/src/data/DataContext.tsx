// Datenzugriff der Ansichten: Repositories über der DB des Kontos (Komponenten greifen nie direkt auf Dexie zu, Spec 01).
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createIdGenerator } from '@stb/core';
import { useAuth } from '@/auth/AuthContext';
import { plainCodec } from './codec/plain';
import { createCodecRegistry } from './codec/registry';
import { createRecordRepository, type RecordRepository } from './repositories/records';
import { createDiaryRepository, type DiaryRepository } from './repositories/diary';
import { createStamper, type Stamper } from './identity';

export interface DataApi {
  records: RecordRepository;
  diary: DiaryRepository;
  /** Neue UUID v7 (Spec 02). */
  newId: () => string;
  /** HLC-Stempel und Autor für lokale Änderungen. */
  stamper: Stamper;
  now: () => number;
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { db, now } = useAuth();
  const api = useMemo<DataApi>(() => {
    // v3.0: lokal `plain`; Outbox erst mit Modus „Mit Konto" (M8). Im Modus „nur auf diesem Gerät" keine Outbox (Spec 04).
    const records = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock: { now }, outbox: false });
    const { newId } = createIdGenerator({ now });
    return { records, diary: createDiaryRepository(records), newId, stamper: createStamper(db, { now }, newId), now };
  }, [db, now]);
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData außerhalb von <DataProvider>');
  return ctx;
}
