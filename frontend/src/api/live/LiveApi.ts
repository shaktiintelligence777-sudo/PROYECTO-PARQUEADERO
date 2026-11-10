import { ErrorApi, type ApiClient } from '../client';

/**
 * Esqueleto del adaptador `live`. Toda operación falla con "no implementado";
 * el adaptador HTTP real lo construye C-01.
 */
export function crearLiveApi(urlBase: string): ApiClient {
  let token: string | null = null;
  return new Proxy({} as ApiClient, {
    get(_obj, nombre) {
      if (nombre === 'establecerToken') return (t: string | null) => { token = t; void token; };
      return () => Promise.reject(new ErrorApi(501, 'error_interno', `El adaptador live (${urlBase}) aún no está implementado: ${String(nombre)}.`));
    },
  });
}
