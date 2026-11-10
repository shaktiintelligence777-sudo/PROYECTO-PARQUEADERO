import { entorno } from '@/lib/entorno';
import type { ApiClient } from './client';
import { almacenSesion } from '@/features/auth/almacenSesion';
import { conSesion } from './conSesion';
import { crearLiveApi } from './live/LiveApi';
import { MockApi } from './mock/MockApi';

let instancia: ApiClient | null = null;

/** Devuelve el adaptador según VITE_API_MODE (mock por defecto). */
export function obtenerApi(): ApiClient {
  instancia ??= conSesion(entorno.modo === 'mock' ? new MockApi() : crearLiveApi(entorno.apiUrl), almacenSesion);
  return instancia;
}

/** Solo para pruebas: reemplaza (o limpia) el adaptador compartido. */
export function fijarApi(api: ApiClient | null): void { instancia = api; }

export * from './client';
