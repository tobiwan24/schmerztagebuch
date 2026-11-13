import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { DataProvider } from './data/DataContext';
import { SyncProvider } from './data/SyncContext';
import { router } from './router';
import { UpdateBanner } from './components/UpdateBanner';

export function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <SyncProvider>
          <UpdateBanner />
          <RouterProvider router={router} />
        </SyncProvider>
      </DataProvider>
    </AuthProvider>
  );
}
