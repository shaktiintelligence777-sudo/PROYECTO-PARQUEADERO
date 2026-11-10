import { entorno } from '@/lib/entorno';
import type { ApiClient } from './client';
import { crearLiveApi } from './live/LiveApi';
import { MockApi } from './mock/MockApi';

let instancia: ApiClient | null = null;

/** Devuelve el adaptador según VITE_API_MODE (mock por defecto). */
export function obtenerApi(): ApiClient {
  instancia ??= entorno.modo === 'mock' ? new MockApi() : crearLiveApi(entorno.apiUrl);
  return instancia;
}

/** Solo para pruebas: reemplaza (o limpia) el adaptador compartido. */
export function fijarApi(api: ApiClient | null): void { instancia = api; }

export * from './client';
