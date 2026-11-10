import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fijarApi } from '@/api';
import { crearEntorno, montar, type Entorno } from '@/test/montar';
import { RUTAS } from './rutas';

let e: Entorno;
beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  e = crearEntorno();
  // Sesión de admin ya iniciada: el refresh guardado se restaura al montar.
  const s = await e.api.login({ email: 'demo@parqueadero.app', password: 'demo1234' });
  e.almacen.guardar(s.refresh_token);
});
afterEach(() => { fijarApi(null); });

describe('ruteo', () => {
  it('CA-3 /login (sin sesión) muestra P1', async () => {
    e.almacen.borrar();
    montar('/login', e);
    expect(await screen.findByRole('heading', { name: 'Parqueadero' })).toBeInTheDocument();
  });
  it.each(RUTAS.filter((r) => r.rol !== 'publico').map((r) => [r.ruta, r.pantalla] as const))('CA-3 %s muestra %s', async (ruta, pantalla) => {
    montar(ruta.replace(':id', '123'), e);
    // P3 ya es la pantalla real (A-05): su título es "Acceso".
    const titulo = ruta === '/acceso' ? 'Acceso' : pantalla;
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
  });
  it('CA-3 ruta desconocida', async () => {
    montar('/no-existe', e);
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
