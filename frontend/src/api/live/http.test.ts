import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../client';
import { MENSAJE_SIN_CONEXION, construirConsulta, crearHttp } from './http';

const URL_BASE = 'https://api.test';

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

async function capturar(promesa: Promise<unknown>): Promise<ErrorApi> {
  try {
    await promesa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorApi);
    return e as ErrorApi;
  }
  throw new Error('se esperaba un ErrorApi');
}

afterEach(() => { vi.useRealTimers(); });

describe('C-01 · http', () => {
  it('usa /api/v1, credentials omit y Content-Type solo con cuerpo', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json(200, { ok: true }));
    const http = crearHttp(`${URL_BASE}/`, { fetch });
    await http({ metodo: 'POST', ruta: '/pagos', cuerpo: { a: 1 }, token: 't' });
    await http({ metodo: 'GET', ruta: '/planes' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/pagos');
    expect(init.credentials).toBe('omit');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Authorization: 'Bearer t' });
    const [, init2] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(init2.headers).not.toHaveProperty('Content-Type');
    expect(init2.headers).not.toHaveProperty('Authorization');
  });

  it('CA-3 un 409 con cuerpo Error se convierte en ErrorApi con su código', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json(409, { error: { codigo: 'membresia_existente', mensaje: 'Este cliente ya tiene una membresía.' } }),
    );
    const e = await capturar(crearHttp(URL_BASE, { fetch })({ metodo: 'POST', ruta: '/membresias', cuerpo: {} }));
    expect(e.status).toBe(409);
    expect(e.codigo).toBe('membresia_existente');
    expect(e.mensaje).toBe('Este cliente ya tiene una membresía.');
  });

  it('CA-4 un 422 conserva los detalles', async () => {
    const detalles = [{ campo: 'nota', mensaje: 'Explica por qué el monto es distinto al del plan.' }];
    const fetch = vi.fn().mockResolvedValue(json(422, { error: { codigo: 'validacion', mensaje: 'Revisa los campos marcados.', detalles } }));
    const e = await capturar(crearHttp(URL_BASE, { fetch })({ metodo: 'POST', ruta: '/pagos', cuerpo: {} }));
    expect(e.status).toBe(422);
    expect(e.codigo).toBe('validacion');
    expect(e.detalles).toEqual(detalles);
  });

  it('CA-5 un 502 con HTML es error_interno', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    const e = await capturar(crearHttp(URL_BASE, { fetch })({ metodo: 'GET', ruta: '/planes' }));
    expect(e.status).toBe(502);
    expect(e.codigo).toBe('error_interno');
  });

  it('CA-5 un JSON que no es el esquema Error también es error_interno', async () => {
    const fetch = vi.fn().mockResolvedValue(json(500, { detail: 'Internal Server Error' }));
    const e = await capturar(crearHttp(URL_BASE, { fetch })({ metodo: 'GET', ruta: '/planes' }));
    expect(e.codigo).toBe('error_interno');
  });

  it('CA-6 un fallo de red da status 0 y el mensaje de sin conexión', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const e = await capturar(crearHttp(URL_BASE, { fetch })({ metodo: 'GET', ruta: '/planes' }));
    expect(e.status).toBe(0);
    expect(e.codigo).toBe('error_interno');
    expect(e.mensaje).toBe(MENSAJE_SIN_CONEXION);
    expect(MENSAJE_SIN_CONEXION).toBe('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
  });

  it('CA-6 una respuesta que tarda más de 15 segundos se aborta', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_ok, fallar) => {
      init.signal?.addEventListener('abort', () => fallar(new DOMException('Abortado', 'AbortError')));
    }));
    const promesa = capturar(crearHttp(URL_BASE, { fetch: fetch as unknown as typeof globalThis.fetch })({ metodo: 'GET', ruta: '/planes' }));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    const e = await promesa;
    expect(e.status).toBe(0);
    expect(e.mensaje).toBe(MENSAJE_SIN_CONEXION);
  });

  it('CA-7 la consulta omite undefined, null y cadenas vacías', () => {
    expect(construirConsulta({ q: '', pagina: 2, estado: undefined, cliente_id: null })).toBe('?pagina=2');
    expect(construirConsulta({ activo: false, q: 'ana maría' })).toBe('?activo=false&q=ana+mar%C3%ADa');
    expect(construirConsulta({})).toBe('');
  });

  it('204 devuelve undefined y la descarga devuelve un Blob', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('placa;entrada\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    const http = crearHttp(URL_BASE, { fetch });
    expect(await http({ metodo: 'POST', ruta: '/auth/logout', cuerpo: {} })).toBeUndefined();
    const blob = await http<Blob>({ metodo: 'GET', ruta: '/accesos/historial/export', respuesta: 'blob' });
    expect(blob.type).toBe('text/csv'); // Blob de Node (fetch), no el de jsdom
    expect(await blob.text()).toBe('placa;entrada\n');
    const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Accept: 'text/csv' });
  });
});
