import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { conSesion } from '../conSesion';
import { ErrorApi, type ApiClient } from '../client';
import { crearApi } from '../index';
import { LiveApi } from './LiveApi';

const CONTRATO = resolve(process.cwd(), '../contracts/openapi.yaml');
const EXCLUIDAS = new Set(['salud', 'ejecutarJobNotificaciones']);
const METODOS = ['get', 'post', 'put', 'patch', 'delete'];

interface Operacion { id: string; metodo: string; ruta: string; conCuerpo: boolean }

function operaciones(): Operacion[] {
  const doc = parse(readFileSync(CONTRATO, 'utf8')) as { paths: Record<string, Record<string, { operationId?: string; requestBody?: unknown }>> };
  const ops: Operacion[] = [];
  for (const [ruta, item] of Object.entries(doc.paths)) {
    for (const metodo of METODOS) {
      const op = item[metodo];
      if (op?.operationId && !EXCLUIDAS.has(op.operationId)) {
        ops.push({ id: op.operationId, metodo: metodo.toUpperCase(), ruta, conCuerpo: Boolean(op.requestBody) });
      }
    }
  }
  return ops;
}

function respuesta(status = 200, cuerpo: unknown = {}): Response {
  return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(cuerpo), { status });
}

describe('C-01 · LiveApi', () => {
  it('CA-1 en modo live obtenerApi usa LiveApi', () => {
    const api = crearApi({ modo: 'live', apiUrl: 'https://api.test', base: '/', errorConfiguracion: null });
    expect(api).toBeInstanceOf(LiveApi);
  });

  it.each(operaciones())('CA-1 $id usa $metodo $ruta', async ({ id, metodo, ruta, conCuerpo }) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => respuesta());
    const api = new LiveApi('https://api.test', { fetch }) as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
    expect(typeof api[id]).toBe('function');
    const args: unknown[] = [];
    if (ruta.includes('{id}')) args.push('id-123');
    if (id === 'consultarPlaca') args.push('ABC12D');
    else if (conCuerpo || id === 'exportarHistorialAccesos') args.push({});
    await api[id]?.(...args);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const { pathname } = new URL(url);
    expect(init.method).toBe(metodo);
    expect(pathname).toBe(`/api/v1${ruta.replace('{id}', 'id-123')}`);
  });

  it('CA-2 con token cada petición lleva Authorization; login no', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => respuesta());
    const api = new LiveApi('https://api.test', { fetch });
    api.establecerToken('token-de-acceso');
    await api.login({ email: 'a@b.co', password: 'x' });
    await api.listarClientes();
    await api.registrarPago({ membresia_id: 'm', monto: 1, metodo: 'efectivo' });
    const [c0, c1, c2] = fetch.mock.calls.map(([, init]) => init?.headers as Record<string, string>);
    expect(c0).not.toHaveProperty('Authorization');
    expect(c1?.Authorization).toBe('Bearer token-de-acceso');
    expect(c2?.Authorization).toBe('Bearer token-de-acceso');
  });

  it('CA-7 listarClientes con q vacía pide …/clientes?pagina=2', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => respuesta(200, { items: [], total: 0, pagina: 2, por_pagina: 20 }));
    await new LiveApi('https://api.test', { fetch }).listarClientes({ q: '', pagina: 2 });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.test/api/v1/clientes?pagina=2');
  });

  it('CA-8 con el access vencido y un refresh válido, la consulta devuelve los datos sin pedir login', async () => {
    const sesionNueva = { access_token: 'nuevo', refresh_token: 'refresh-2', token_type: 'bearer', expires_in: 900, usuario: {} };
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>).Authorization;
      if (url.endsWith('/auth/refresh')) return respuesta(200, sesionNueva);
      if (auth === 'Bearer nuevo') return respuesta(200, { items: [{ id: 'p1' }] });
      return respuesta(401, { error: { codigo: 'token_invalido', mensaje: 'Tu sesión venció. Inicia sesión otra vez.' } });
    });
    const almacen = { leer: vi.fn(() => 'refresh-1'), guardar: vi.fn(), borrar: vi.fn(), notificarExpiracion: vi.fn() };
    const base = new LiveApi('https://api.test', { fetch: fetch as unknown as typeof globalThis.fetch });
    base.establecerToken('vencido');
    const api = conSesion(base, almacen as never);
    const planes = await api.listarPlanes();
    expect(planes.items).toEqual([{ id: 'p1' }]);
    expect(almacen.guardar).toHaveBeenCalledWith('refresh-2');
    expect(almacen.notificarExpiracion).not.toHaveBeenCalled();
    const refresh = fetch.mock.calls.find(([u]) => String(u).endsWith('/auth/refresh'));
    expect(JSON.parse(String(refresh?.[1].body))).toEqual({ refresh_token: 'refresh-1' });
  });

  it('CA-9 sin URL en modo live no hace peticiones y avisa', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const api: ApiClient = crearApi({
      modo: 'live', apiUrl: '', base: '/', errorConfiguracion: 'Falta configurar la dirección del servidor.',
    });
    await expect(api.login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({
      status: 0, mensaje: 'Falta configurar la dirección del servidor.',
    });
    await expect(api.listarPlanes()).rejects.toBeInstanceOf(ErrorApi);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
