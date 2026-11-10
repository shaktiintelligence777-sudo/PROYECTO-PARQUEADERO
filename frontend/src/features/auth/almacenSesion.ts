export const CLAVE_REFRESH = 'parqueadero.sesion';

type Oyente = () => void;

/**
 * Persistencia del refresh token (sessionStorage) y aviso de sesión vencida.
 * El access token NUNCA se guarda aquí: vive solo en memoria dentro del adaptador de API.
 */
export interface AlmacenSesion {
  leer(): string | null;
  guardar(refreshToken: string): void;
  borrar(): void;
  /** Se llama cuando un refresh falla y la sesión debe darse por terminada. */
  alExpirar(oyente: Oyente): () => void;
  notificarExpiracion(): void;
}

export function crearAlmacenSesion(storage: Storage = window.sessionStorage): AlmacenSesion {
  const oyentes = new Set<Oyente>();
  return {
    leer() { try { return storage.getItem(CLAVE_REFRESH); } catch { return null; } },
    guardar(t) { try { storage.setItem(CLAVE_REFRESH, t); } catch { /* sin acceso: la sesión no sobrevivirá a una recarga */ } },
    borrar() { try { storage.removeItem(CLAVE_REFRESH); } catch { /* sin acceso */ } },
    alExpirar(oyente) { oyentes.add(oyente); return () => { oyentes.delete(oyente); }; },
    notificarExpiracion() { oyentes.forEach((o) => o()); },
  };
}

export const almacenSesion: AlmacenSesion = crearAlmacenSesion();
