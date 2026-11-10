import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { ProveedorToasts } from '@/ui';
import { RutasApp } from './rutas';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorToasts>
        <HashRouter>
          <RutasApp />
        </HashRouter>
      </ProveedorToasts>
    </QueryClientProvider>
  );
}
