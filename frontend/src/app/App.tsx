import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { ProveedorToasts } from '@/ui';
import { ConexionBannerDemo } from './ConexionBannerDemo';
import { RutasApp } from './rutas';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorToasts>
        <HashRouter>
          <ConexionBannerDemo />
          <RutasApp />
        </HashRouter>
      </ProveedorToasts>
    </QueryClientProvider>
  );
}
