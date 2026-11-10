import { describe, expect, it, vi } from 'vitest';
import { crearAlmacenSesion } from '@/features/auth/almacenSesion';
import { conSesion } from './conSesion';
import { ErrorApi, type ApiClient } from './client';

function crearBase() {
  let valido = false;
  const base = {
    establecerToken: vi.fn((t: string | null) => { valido = t === 'nuevo'; }),
    refrescarSesion: vi.fn(async () => ({ access_token: 'nuevo', refresh_token: 'r2', usuario: {} })),
    listarClientes: vi.fn(async () => {
      if (!valido) throw new ErrorApi(401, 'token_invalido', 'vencido');
      return { items: [] };
    }),
  };
  return base as unknown as ApiClient & typeof base;
}

describe('conSesion', () => {
  it('CA-8 tres llamadas simultáneas con 401 comparten un único refresh', async () => {
    const almacen = crearAlmacenSesion(window.sessionStorage);
    almacen.guardar('r1');
    const base = crearBase();
    const api = conSesion(base, almacen) as unknown as { listarClientes(): Promise<unknown> };
    const r = await Promise.all([api.listarClientes(), api.listarClientes(), api.listarClientes()]);
    expect(base.refrescarSesion).toHaveBeenCalledTimes(1);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x !== undefined)).toBe(true);
    expect(almacen.leer()).toBe('r2');
  });

  it('si el refresh falla avisa la expiración, limpia y relanza el error original', async () => {
    const almacen = crearAlmacenSesion(window.sessionStorage);
    almacen.guardar('r1');
    const base = crearBase();
    base.refrescarSesion.mockRejectedValue(new ErrorApi(401, 'token_invalido', 'x'));
    const oyente = vi.fn();
    almacen.alExpirar(oyente);
    const api = conSesion(base, almacen) as unknown as { listarClientes(): Promise<unknown> };
    await expect(api.listarClientes()).rejects.toMatchObject({ status: 401 });
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(almacen.leer()).toBeNull();
  });
});
