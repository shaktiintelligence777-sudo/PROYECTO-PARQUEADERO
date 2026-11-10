import type { AlmacenSesion } from '@/features/auth/almacenSesion';
import { ErrorApi, type ApiClient, type Sesion } from './client';

/** Operaciones que no se reintentan tras un 401 (no necesitan sesión o son ellas mismas la renovación). */
const SIN_REINTENTO = new Set<string | symbol>(['establecerToken', 'login', 'refrescarSesion', 'logout']);

/**
 * Envuelve un ApiClient: ante un 401 intenta UN refresh y repite la llamada original.
 * Varias llamadas que fallan a la vez comparten un único refresh. Si el refresh falla,
 * limpia el refresh token, avisa de la expiración y devuelve el error original.
 * No depende del adaptador (sirve igual con `mock` y con `live`).
 */
export function conSesion(base: ApiClient, almacen: AlmacenSesion): ApiClient {
  let renovando: Promise<Sesion> | null = null;

  const renovar = (): Promise<Sesion> => {
    renovando ??= (async () => {
      const refresh = almacen.leer();
      if (!refresh) throw new ErrorApi(401, 'no_autenticado', 'Inicia sesión para continuar.');
      const s = await base.refrescarSesion({ refresh_token: refresh });
      almacen.guardar(s.refresh_token); // el refresh es de un solo uso: se reemplaza en cada rotación
      base.establecerToken(s.access_token);
      return s;
    })().finally(() => { renovando = null; });
    return renovando;
  };

  return new Proxy(base, {
    get(objetivo, nombre) {
      const original = Reflect.get(objetivo, nombre, objetivo) as unknown;
      if (typeof original !== 'function') return original;
      const metodo = (original as (...a: unknown[]) => Promise<unknown>).bind(objetivo);
      if (SIN_REINTENTO.has(nombre)) return metodo;
      return async (...args: unknown[]) => {
        try {
          return await metodo(...args);
        } catch (e) {
          if (!(e instanceof ErrorApi) || e.status !== 401) throw e;
          try {
            await renovar();
          } catch {
            almacen.borrar();
            base.establecerToken(null);
            almacen.notificarExpiracion();
            throw e;
          }
          return metodo(...args);
        }
      };
    },
  });
}
