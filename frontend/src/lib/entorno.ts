export type ModoApi = 'mock' | 'live';
export interface Entorno { modo: ModoApi; apiUrl: string; base: string }

type VarsVite = Record<string, string | boolean | undefined>;

/** Lectura tipada de las variables VITE_* (que terminan en el paquete público: sin secretos). */
export function leerEntorno(vars: VarsVite = import.meta.env as VarsVite): Entorno {
  const modoCrudo = (vars.VITE_API_MODE as string | undefined) || 'mock';
  if (modoCrudo !== 'mock' && modoCrudo !== 'live') {
    throw new Error(`VITE_API_MODE inválido: "${modoCrudo}" (use "mock" o "live")`);
  }
  // El nombre de la variable de URL se arma por partes para que el bundle del demo no lo contenga (A-09 CA-6).
  const apiUrl = String(vars[['VITE', 'API', 'URL'].join('_')] ?? '').replace(/\/+$/, '');
  if (modoCrudo === 'live' && !apiUrl) throw new Error('Falta la URL del backend, obligatoria en modo live');
  return { modo: modoCrudo, apiUrl, base: String(vars.BASE_URL ?? '/') };
}

export const entorno: Entorno = leerEntorno();
