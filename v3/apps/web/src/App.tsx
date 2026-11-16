import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { DataProvider } from './data/DataContext';
import { SyncProvider } from './data/SyncContext';
import { AnalysisProvider } from './data/AnalysisContext';
import { router } from './router';
import { UpdateBanner } from './components/UpdateBanner';
import { WeatherBackfill } from './components/WeatherBackfill';
import { AutoBackup } from './components/AutoBackup';

export function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <SyncProvider>
          <AnalysisProvider>
            <UpdateBanner />
            <WeatherBackfill />
            <AutoBackup />
            <RouterProvider router={router} />
          </AnalysisProvider>
        </SyncProvider>
      </DataProvider>
    </AuthProvider>
  );
}
