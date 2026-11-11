import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorApi } from '@/api';
import { HashRouter } from 'react-router-dom';
import { ProveedorSesion } from '@/features/auth/ProveedorSesion';
import { ProveedorToasts } from '@/ui';
import { ConexionBannerDemo } from './ConexionBannerDemo';
import { RutasApp } from './rutas';

/** Las lecturas reintentan una vez solo si no hubo conexión (status 0); las mutaciones nunca (C-01, regla 8). */
export const reintentarLectura = (fallos: number, error: unknown) => fallos < 1 && error instanceof ErrorApi && error.status === 0;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: reintentarLectura, refetchOnWindowFocus: false }, mutations: { retry: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorToasts>
        <HashRouter>
          <ProveedorSesion>
            <ConexionBannerDemo />
            <RutasApp />
          </ProveedorSesion>
        </HashRouter>
      </ProveedorToasts>
    </QueryClientProvider>
  );
}
