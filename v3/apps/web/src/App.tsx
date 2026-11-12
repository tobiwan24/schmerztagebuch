import { RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { DataProvider } from './data/DataContext';
import { router } from './router';
import { UpdateBanner } from './components/UpdateBanner';

export function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <UpdateBanner />
        <RouterProvider router={router} />
      </DataProvider>
    </AuthProvider>
  );
}
