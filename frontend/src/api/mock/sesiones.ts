import { nuevoId } from './ids';

interface Acceso { usuario_id: string; expira: number }
interface Refresco { usuario_id: string; usado: boolean }
interface Estado { accesos: Record<string, Acceso>; refrescos: Record<string, Refresco> }

export const CLAVE_SESION = 'parqueadero.demo.sesion';
export const VIDA_ACCESO_S = 900;

/** Tokens ficticios del mock. Viven en sessionStorage: se pierden al cerrar la pestaña. */
export class Sesiones {
  constructor(private readonly almacenamiento: Storage) {}

  private leer(): Estado {
    try {
      const e = JSON.parse(this.almacenamiento.getItem(CLAVE_SESION) ?? 'null') as Estado | null;
      if (e && e.accesos && e.refrescos) return e;
    } catch { /* se reinicia */ }
    return { accesos: {}, refrescos: {} };
  }
  private guardar(e: Estado): void {
    try { this.almacenamiento.setItem(CLAVE_SESION, JSON.stringify(e)); } catch { /* sin acceso */ }
  }

  emitir(usuarioId: string, ahoraMs: number): { access_token: string; refresh_token: string; expires_in: number } {
    const e = this.leer();
    const access = `mock.${usuarioId}.${nuevoId().replace(/-/g, '')}`;
    const refresh = `mockr.${usuarioId}.${nuevoId().replace(/-/g, '')}`;
    e.accesos[access] = { usuario_id: usuarioId, expira: ahoraMs + VIDA_ACCESO_S * 1000 };
    e.refrescos[refresh] = { usuario_id: usuarioId, usado: false };
    this.guardar(e);
    return { access_token: access, refresh_token: refresh, expires_in: VIDA_ACCESO_S };
  }

  acceso(token: string): Acceso | undefined { return this.leer().accesos[token]; }

  /** Consume un refresh: devuelve el usuario, o 'reutilizado' (revoca todo) o 'desconocido'. */
  consumirRefresco(token: string): { usuario_id: string } | 'reutilizado' | 'desconocido' {
    const e = this.leer();
    const r = e.refrescos[token];
    if (!r) return 'desconocido';
    if (r.usado) { this.revocarUsuarioEn(e, r.usuario_id); this.guardar(e); return 'reutilizado'; }
    r.usado = true;
    this.guardar(e);
    return { usuario_id: r.usuario_id };
  }

  olvidarRefresco(token: string): void {
    const e = this.leer();
    delete e.refrescos[token];
    this.guardar(e);
  }

  revocarUsuario(usuarioId: string): void {
    const e = this.leer();
    this.revocarUsuarioEn(e, usuarioId);
    this.guardar(e);
  }

  private revocarUsuarioEn(e: Estado, usuarioId: string): void {
    for (const [k, v] of Object.entries(e.accesos)) if (v.usuario_id === usuarioId) delete e.accesos[k];
    for (const [k, v] of Object.entries(e.refrescos)) if (v.usuario_id === usuarioId) delete e.refrescos[k];
  }
}
