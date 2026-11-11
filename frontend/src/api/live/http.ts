import { ErrorApi, type CodigoError, type DetalleError } from '../client';

/** Tiempo límite de cada petición (C-01, regla 4). */
export const TIEMPO_LIMITE_MS = 15_000;
export const MENSAJE_SIN_CONEXION = 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
export const MENSAJE_ERROR_INTERNO = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

export type ValorConsulta = string | number | boolean | null | undefined;
export type Consulta = Record<string, ValorConsulta>;
export type Metodo = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Peticion {
  metodo: Metodo;
  /** Ruta relativa a `/api/v1`, con los parámetros de ruta ya sustituidos. */
  ruta: string;
  consulta?: Consulta;
  cuerpo?: unknown;
  token?: string | null;
  /** `blob` para descargas (CSV); `json` por defecto. */
  respuesta?: 'json' | 'blob';
}

export interface OpcionesHttp {
  fetch?: typeof fetch;
  tiempoLimiteMs?: number;
}

const sinConexion = () => new ErrorApi(0, 'error_interno', MENSAJE_SIN_CONEXION);
const errorInterno = (status: number) => new ErrorApi(status, 'error_interno', MENSAJE_ERROR_INTERNO);

/** Arma la query omitiendo `undefined`, `null` y cadenas vacías (regla 6). */
export function construirConsulta(consulta: Consulta = {}): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(consulta)) {
    if (valor === undefined || valor === null || valor === '') continue;
    params.append(clave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : '';
}

function esDetalles(valor: unknown): valor is DetalleError[] {
  return Array.isArray(valor) && valor.every(
    (d) => typeof d === 'object' && d !== null && typeof (d as DetalleError).campo === 'string'
      && typeof (d as DetalleError).mensaje === 'string',
  );
}

/** Convierte una respuesta no 2xx en ErrorApi; si el cuerpo no es el esquema `Error`, `error_interno` (regla 3). */
async function aErrorApi(respuesta: Response): Promise<ErrorApi> {
  let cuerpo: unknown;
  try {
    cuerpo = await respuesta.json();
  } catch {
    return errorInterno(respuesta.status);
  }
  const error = (cuerpo as { error?: unknown } | null)?.error as
    | { codigo?: unknown; mensaje?: unknown; detalles?: unknown }
    | undefined;
  if (!error || typeof error.codigo !== 'string' || typeof error.mensaje !== 'string') {
    return errorInterno(respuesta.status);
  }
  const detalles = esDetalles(error.detalles) ? error.detalles : undefined;
  return new ErrorApi(respuesta.status, error.codigo as CodigoError, error.mensaje, detalles);
}

/** Cliente HTTP mínimo del adaptador live. No reintenta: eso es de `conSesion` y TanStack Query. */
export function crearHttp(urlBase: string, opciones: OpcionesHttp = {}) {
  const base = `${urlBase.replace(/\/+$/, '')}/api/v1`;
  const tiempoLimite = opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_MS;

  return async function peticion<T>(p: Peticion): Promise<T> {
    const hacerFetch = opciones.fetch ?? globalThis.fetch;
    const cabeceras: Record<string, string> = {
      Accept: p.respuesta === 'blob' ? 'text/csv' : 'application/json',
    };
    if (p.token) cabeceras.Authorization = `Bearer ${p.token}`;
    if (p.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), tiempoLimite);
    try {
      let respuesta: Response;
      try {
        respuesta = await hacerFetch(`${base}${p.ruta}${construirConsulta(p.consulta)}`, {
          method: p.metodo,
          headers: cabeceras,
          body: p.cuerpo === undefined ? undefined : JSON.stringify(p.cuerpo),
          credentials: 'omit',
          signal: control.signal,
        });
      } catch {
        throw sinConexion(); // fallo de red o tiempo límite
      }
      if (!respuesta.ok) throw await aErrorApi(respuesta);
      if (respuesta.status === 204) return undefined as T;
      try {
        return (p.respuesta === 'blob' ? await respuesta.blob() : await respuesta.json()) as T;
      } catch {
        throw control.signal.aborted ? sinConexion() : errorInterno(respuesta.status);
      }
    } finally {
      clearTimeout(temporizador);
    }
  };
}

export type Http = ReturnType<typeof crearHttp>;
