import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fijarApi } from '@/api';
import { MockApi } from '@/api/mock/MockApi';
import { relojFijo } from '@/api/mock/reloj';
import { EMAIL_ADMIN, PASSWORD_DEMO } from '@/api/mock/semilla';
import { ConexionBannerDemo } from './ConexionBannerDemo';

const TEXTO = 'Modo demo: los datos son ficticios y se guardan solo en este navegador.';
let api: MockApi;
const montar = (modo?: 'mock' | 'live') => render(<QueryClientProvider client={new QueryClient()}><ConexionBannerDemo modo={modo} /></QueryClientProvider>);

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  api = new MockApi({ almacenamiento: localStorage, sesion: sessionStorage, reloj: relojFijo('2026-11-10T17:00:00Z'), espera: 0 });
  api.establecerToken((await api.login({ email: EMAIL_ADMIN, password: PASSWORD_DEMO })).access_token);
  fijarApi(api);
});
afterEach(() => fijarApi(null));

describe('A-09 · banner de demo', () => {
  it('CA-4 en modo mock se ve el banner; en modo live no se renderiza', () => {
    const { unmount } = montar('mock');
    expect(screen.getByText(TEXTO)).toBeInTheDocument();
    unmount();
    montar('live');
    expect(screen.queryByText(TEXTO)).toBeNull();
  });

  it('CA-5 confirmar reinicia los datos y conserva la sesión; cancelar no toca nada', async () => {
    const user = userEvent.setup();
    await api.crearCliente({ nombre: 'Cliente Temporal', documento: 'TEMPORAL1', telefono: '3001112233' });
    montar('mock');

    await user.click(screen.getByRole('button', { name: 'Reiniciar datos' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect((await api.listarClientes({ q: 'Temporal' })).total).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Reiniciar datos' }));
    await user.click(screen.getByRole('button', { name: 'Reiniciar' }));
    expect((await api.listarClientes({ q: 'Temporal' })).total).toBe(0);
    expect((await api.usuarioActual()).email).toBe(EMAIL_ADMIN); // la sesión sigue iniciada
  });
});
