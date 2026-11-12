// Datenzugriff der Ansichten: Repositories über der DB des Kontos (Komponenten greifen nie direkt auf Dexie zu, Spec 01).
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { plainCodec } from './codec/plain';
import { createCodecRegistry } from './codec/registry';
import { createRecordRepository, type RecordRepository } from './repositories/records';
import { createDiaryRepository, type DiaryRepository } from './repositories/diary';

export interface DataApi {
  records: RecordRepository;
  diary: DiaryRepository;
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { db, now } = useAuth();
  const api = useMemo<DataApi>(() => {
    // v3.0: lokal `plain`; Outbox erst mit Modus „Mit Konto" (M8). Im Modus „nur auf diesem Gerät" keine Outbox (Spec 04).
    const records = createRecordRepository(db, { registry: createCodecRegistry([plainCodec]), writeCodec: 'plain', clock: { now }, outbox: false });
    return { records, diary: createDiaryRepository(records) };
  }, [db, now]);
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData außerhalb von <DataProvider>');
  return ctx;
}
