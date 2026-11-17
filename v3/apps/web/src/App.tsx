import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { DataProvider } from './data/DataContext';
import { SyncProvider } from './data/SyncContext';
import { LocalEncryptionProvider } from './data/LocalEncryptionContext';
import { AnalysisProvider } from './data/AnalysisContext';
import { router } from './router';
import { UpdateBanner } from './components/UpdateBanner';
import { WeatherBackfill } from './components/WeatherBackfill';
import { QuickEntryMigration } from './components/QuickEntryMigration';
import { AutoBackup } from './components/AutoBackup';

export function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <LocalEncryptionProvider>
          <SyncProvider>
            <AnalysisProvider>
              <UpdateBanner />
              <WeatherBackfill />
              <QuickEntryMigration />
              <AutoBackup />
              <RouterProvider router={router} />
            </AnalysisProvider>
          </SyncProvider>
        </LocalEncryptionProvider>
      </DataProvider>
    </AuthProvider>
  );
}
