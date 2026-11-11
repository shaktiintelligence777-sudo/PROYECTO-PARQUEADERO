import { DEMO_EN_BUILD, entorno, type Entorno } from '@/lib/entorno';
import { ErrorApi, type ApiClient } from './client';
import { almacenSesion } from '@/features/auth/almacenSesion';
import { conSesion } from './conSesion';
import { crearLiveApi } from './live/LiveApi';
import type { MockApi } from './mock/MockApi';

let instancia: ApiClient | null = null;
let mock: Promise<MockApi> | null = null;

/** Carga MockApi solo en modo mock: el build live no incluye la semilla ni las contraseñas del demo (C-01). */
function cargarMock(): Promise<MockApi> {
  if (!DEMO_EN_BUILD) return Promise.reject(new ErrorApi(0, 'error_interno', 'El modo demo no está incluido en esta versión.'));
  mock ??= import('./mock/MockApi').then(({ MockApi }) => new MockApi());
  return mock;
}

/** ApiClient que delega en MockApi cuando termina de cargarse. */
function mockPerezoso(): ApiClient {
  let token: string | null = null;
  return new Proxy({} as ApiClient, {
    get(_obj, nombre) {
      if (nombre === 'establecerToken') {
        return (t: string | null) => {
          token = t;
          void cargarMock().then((m) => m.establecerToken(token));
        };
      }
      return async (...args: unknown[]) => {
        const m = await cargarMock();
        m.establecerToken(token);
        const metodo = Reflect.get(m, nombre) as (...a: unknown[]) => Promise<unknown>;
        return metodo.apply(m, args);
      };
    },
  });
}

/** ApiClient que no hace peticiones: la app no está configurada (C-01, regla 1). */
function sinConfigurar(mensaje: string): ApiClient {
  return new Proxy({} as ApiClient, {
    get(_obj, nombre) {
      if (nombre === 'establecerToken') return () => undefined;
      return () => Promise.reject(new ErrorApi(0, 'error_interno', mensaje));
    },
  });
}

export function crearApi(e: Entorno): ApiClient {
  if (e.errorConfiguracion) return sinConfigurar(e.errorConfiguracion);
  return e.modo === 'mock' ? mockPerezoso() : crearLiveApi(e.apiUrl);
}

/** Devuelve el adaptador según VITE_API_MODE (mock por defecto). */
export function obtenerApi(): ApiClient {
  instancia ??= conSesion(crearApi(entorno), almacenSesion);
  return instancia;
}

/** Modo demo: borra los datos del navegador y vuelve a sembrar. En modo live no hace nada. */
export async function reiniciarDemo(): Promise<void> {
  const api = obtenerApi() as ApiClient & { reiniciarDemo?: () => unknown };
  if (entorno.modo === 'mock' && typeof api.reiniciarDemo === 'function') await api.reiniciarDemo();
}

/** Solo para pruebas: reemplaza (o limpia) el adaptador compartido. */
export function fijarApi(api: ApiClient | null): void { instancia = api; }

export * from './client';
