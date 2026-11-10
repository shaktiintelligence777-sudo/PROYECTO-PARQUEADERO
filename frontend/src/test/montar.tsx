import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fijarApi, type ApiClient } from '@/api';
import { conSesion } from '@/api/conSesion';
import { MockApi } from '@/api/mock/MockApi';
import { relojFijo } from '@/api/mock/reloj';
import { RutasApp } from '@/app/rutas';
import { crearAlmacenSesion, type AlmacenSesion } from '@/features/auth/almacenSesion';
import { ProveedorSesion } from '@/features/auth/ProveedorSesion';
import { ProveedorToasts } from '@/ui';

export const RELOJ = '2026-11-10T17:00:00Z';

export interface Entorno { almacen: AlmacenSesion; qc: QueryClient; api: ApiClient }

/** Crea una API mock con reloj fijo y sin espera, envuelta con conSesion, y la fija como API global. */
export function crearEntorno(base: ApiClient = new MockApi({ espera: 0, reloj: relojFijo(RELOJ) })): Entorno {
  const almacen = crearAlmacenSesion();
  const api = conSesion(base, almacen);
  fijarApi(api);
  return { almacen, qc: new QueryClient({ defaultOptions: { queries: { retry: false } } }), api };
}

export function montar(ruta: string, e: Entorno) {
  return render(
    <QueryClientProvider client={e.qc}>
      <ProveedorToasts>
        <MemoryRouter initialEntries={[ruta]}>
          <ProveedorSesion almacen={e.almacen}>
            <RutasApp />
          </ProveedorSesion>
        </MemoryRouter>
      </ProveedorToasts>
    </QueryClientProvider>,
  );
}

/** Deja una sesión iniciada: al montar, el refresh guardado se restaura. */
export async function iniciarSesion(e: Entorno, rol: 'admin' | 'operador' = 'operador') {
  const email = rol === 'admin' ? 'demo@parqueadero.app' : 'operador@parqueadero.app';
  const s = await e.api.login({ email, password: 'demo1234' });
  e.almacen.guardar(s.refresh_token);
}
