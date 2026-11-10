import type { Db } from './modelo';
import type { Reloj } from './reloj';
import { VERSION_DB, crearSemilla } from './semilla';

export const CLAVE_DB = 'parqueadero.demo.v1';

function valida(x: unknown): x is Db {
  const d = x as Partial<Db> | null;
  return !!d && d.version === VERSION_DB && Array.isArray(d.usuarios) && Array.isArray(d.clientes) && Array.isArray(d.motos)
    && Array.isArray(d.planes) && Array.isArray(d.membresias) && Array.isArray(d.pagos) && Array.isArray(d.estancias)
    && Array.isArray(d.notificaciones) && typeof d.configuracion === 'object' && d.configuracion !== null;
}

/** Lee la base del demo; si falta, está corrupta o es de otra versión, siembra de nuevo. */
export function leerDb(almacenamiento: Storage, reloj: Reloj): Db {
  try {
    const crudo = almacenamiento.getItem(CLAVE_DB);
    if (crudo) {
      const db: unknown = JSON.parse(crudo);
      if (valida(db)) return db;
    }
  } catch { /* corrupta: se reinicia */ }
  const db = crearSemilla(reloj);
  guardarDb(almacenamiento, db);
  return db;
}

export function guardarDb(almacenamiento: Storage, db: Db): void {
  try { almacenamiento.setItem(CLAVE_DB, JSON.stringify(db)); } catch { /* cupo lleno o modo privado: sigue en memoria */ }
}

export function reiniciarDb(almacenamiento: Storage, reloj: Reloj): Db {
  try { almacenamiento.removeItem(CLAVE_DB); } catch { /* sin acceso */ }
  return leerDb(almacenamiento, reloj);
}
