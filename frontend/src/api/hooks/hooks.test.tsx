import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fijarApi } from '../index';
import { MockApi } from '../mock/MockApi';
import { relojFijo } from '../mock/reloj';
import { EMAIL_ADMIN, PASSWORD_DEMO } from '../mock/semilla';
import { useMotosDentro, useResumenDashboard } from './consultas';
import { useRegistrarEntrada, useRegistrarPago } from './mutaciones';

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  const api = new MockApi({ almacenamiento: localStorage, sesion: sessionStorage, reloj: relojFijo('2026-11-10T17:00:00Z'), espera: 0 });
  api.establecerToken((await api.login({ email: EMAIL_ADMIN, password: PASSWORD_DEMO })).access_token);
  fijarApi(api);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => fijarApi(null));

describe('hooks', () => {
  it('CA-18 useRegistrarEntrada invalida accesos y dashboard', async () => {
    const dash = renderHook(() => useResumenDashboard(), { wrapper });
    const dentro = renderHook(() => useMotosDentro(), { wrapper });
    await waitFor(() => expect(dash.result.current.data?.motos_dentro).toBe(5));
    await waitFor(() => expect(dentro.result.current.data?.total).toBe(5));
    const m = renderHook(() => useRegistrarEntrada(), { wrapper });
    await act(async () => { await m.result.current.mutateAsync({ placa: 'GHI11J' }); });
    await waitFor(() => expect(dash.result.current.data?.motos_dentro).toBe(6));
    await waitFor(() => expect(dentro.result.current.data?.total).toBe(6));
  });

  it('registrar un pago invalida el dashboard', async () => {
    const dash = renderHook(() => useResumenDashboard(), { wrapper });
    await waitFor(() => expect(dash.result.current.data?.pagos_hoy.cantidad).toBe(2));
    const membresias = await (await import('../index')).obtenerApi().listarMembresias({ estado: 'por_vencer' });
    const m = renderHook(() => useRegistrarPago(), { wrapper });
    await act(async () => { await m.result.current.mutateAsync({ membresia_id: membresias.items[0]!.id, monto: 60000, metodo: 'efectivo', nota: 'ok' }); });
    await waitFor(() => expect(dash.result.current.data?.pagos_hoy.cantidad).toBe(3));
  });
});
