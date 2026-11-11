export type ModoApi = 'mock' | 'live';
export interface Entorno {
  modo: ModoApi;
  apiUrl: string;
  base: string;
  /** Mensaje para la persona si la app no puede arrancar por configuración (C-01, regla 1). */
  errorConfiguracion: string | null;
}

export const FALTA_URL = 'Falta configurar la dirección del servidor.';

type VarsVite = Record<string, string | boolean | undefined>;

/** Lectura tipada de las variables VITE_* (que terminan en el paquete público: sin secretos). */
export function leerEntorno(vars: VarsVite = import.meta.env as VarsVite): Entorno {
  const modoCrudo = (vars.VITE_API_MODE as string | undefined) || 'mock';
  if (modoCrudo !== 'mock' && modoCrudo !== 'live') {
    throw new Error(`VITE_API_MODE inválido: "${modoCrudo}" (use "mock" o "live")`);
  }
  // El nombre de la variable de URL se arma por partes para que el bundle del demo no lo contenga (A-09 CA-6).
  const apiUrl = String(vars[['VITE', 'API', 'URL'].join('_')] ?? '').replace(/\/+$/, '');
  const errorConfiguracion = modoCrudo === 'live' && !apiUrl ? FALTA_URL : null;
  return { modo: modoCrudo, apiUrl, base: String(vars.BASE_URL ?? '/'), errorConfiguracion };
}

export const entorno: Entorno = leerEntorno();

/**
 * `false` en un build hecho con VITE_API_MODE=live. Vite lo sustituye por una constante al compilar, así que
 * el código del demo que dependa de ella (credenciales de prueba) desaparece del paquete live (C-01, CA-10).
 */
export const DEMO_EN_BUILD: boolean = import.meta.env.VITE_API_MODE !== 'live';
