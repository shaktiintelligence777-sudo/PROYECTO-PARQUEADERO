import { ApiError, type ApiClient } from '../client';
import type { EstadoMembresia, Membresia, Usuario } from '../types';
import { DB_VERSION, isoDate, seed, type Db } from './seed';

const DB_KEY = 'parqueadero-demo-db';
const SESSION_KEY = 'parqueadero-demo-session';
const DAY = 86_400_000;
export const DIAS_AVISO = 3;

export interface MockOptions { storage?: Storage; now?: () => Date; latencyMs?: number }

/** Estado derivado de la fecha de vencimiento (cancelada es manual). */
export function calcularEstado(m: Pick<Membresia, 'fecha_vencimiento' | 'estado'>, hoy: Date): EstadoMembresia {
  if (m.estado === 'cancelada') return 'cancelada';
  const dias = Math.floor((Date.parse(m.fecha_vencimiento) - Date.parse(isoDate(hoy))) / DAY);
  if (dias < 0) return 'vencida';
  return dias <= DIAS_AVISO ? 'por_vencer' : 'activa';
}

export function createMockApi(opts: MockOptions = {}): ApiClient {
  const storage = opts.storage ?? window.localStorage;
  const now = opts.now ?? (() => new Date());
  const latency = opts.latencyMs ?? 120;
  let n = 0;
  const uid = (p: string) => `${p}-${Date.now().toString(36)}${(n++).toString(36)}`;

  const load = (): Db => {
    try {
      const raw = storage.getItem(DB_KEY);
      if (raw) {
        const db = JSON.parse(raw) as Db;
        if (db.version === DB_VERSION) return db;
      }
    } catch { /* datos corruptos: se reinician */ }
    const db = seed(now());
    storage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  };
  const save = (db: Db) => storage.setItem(DB_KEY, JSON.stringify(db));
  const withEstado = (m: Membresia): Membresia => ({ ...m, estado: calcularEstado(m, now()) });
  const wait = () => (latency ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());
  const run = async <T,>(fn: (db: Db) => T): Promise<T> => { await wait(); return fn(load()); };
  const mutate = async <T,>(fn: (db: Db) => T): Promise<T> => {
    await wait(); const db = load(); const out = fn(db); save(db); return out;
  };
  const currentUserId = () => storage.getItem(SESSION_KEY);
  const needUser = (db: Db) => {
    const u = db.usuarios.find((x) => x.id === currentUserId());
    if (!u) throw new ApiError(401, 'Sesión no iniciada');
    return u;
  };
  const strip = (u: Db['usuarios'][number]): Usuario => ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, activo: u.activo });
  const motoPorPlaca = (db: Db, placa: string) => {
    const moto = db.motos.find((m) => m.placa === placa.trim().toUpperCase());
    if (!moto) throw new ApiError(404, `No existe una moto con placa ${placa.toUpperCase()}`);
    return moto;
  };

  return {
    async login(email, password) {
      return run((db) => {
        const u = db.usuarios.find((x) => x.email === email.trim().toLowerCase() && x.password === password && x.activo);
        if (!u) throw new ApiError(401, 'Email o contraseña incorrectos');
        storage.setItem(SESSION_KEY, u.id);
        return strip(u);
      });
    },
    async logout() { storage.removeItem(SESSION_KEY); },
    async me() {
      return run((db) => { const u = db.usuarios.find((x) => x.id === currentUserId()); return u ? strip(u) : null; });
    },

    listClientes: (q) => run((db) => {
      needUser(db);
      const t = q?.trim().toLowerCase();
      return t ? db.clientes.filter((c) => [c.nombre, c.documento, c.telefono].some((v) => v.toLowerCase().includes(t))) : db.clientes;
    }),
    getCliente: (id) => run((db) => {
      needUser(db);
      const c = db.clientes.find((x) => x.id === id);
      if (!c) throw new ApiError(404, 'Cliente no encontrado');
      return c;
    }),
    crearCliente: (data) => mutate((db) => {
      needUser(db);
      if (db.clientes.some((c) => c.documento === data.documento)) throw new ApiError(409, 'Ya existe un cliente con ese documento');
      const c = { id: uid('cli'), ...data }; db.clientes.push(c); return c;
    }),
    actualizarCliente: (id, data) => mutate((db) => {
      needUser(db);
      const c = db.clientes.find((x) => x.id === id);
      if (!c) throw new ApiError(404, 'Cliente no encontrado');
      Object.assign(c, data); return c;
    }),

    listMotos: (f) => run((db) => {
      needUser(db);
      return db.motos.filter((m) => (!f?.placa || m.placa.includes(f.placa.toUpperCase())) && (!f?.cliente_id || m.cliente_id === f.cliente_id));
    }),
    crearMoto: (data) => mutate((db) => {
      needUser(db);
      const placa = data.placa.trim().toUpperCase();
      if (db.motos.some((m) => m.placa === placa)) throw new ApiError(409, 'Ya existe una moto con esa placa');
      const m = { id: uid('mot'), ...data, placa }; db.motos.push(m); return m;
    }),

    listPlanes: () => run((db) => { needUser(db); return db.planes; }),

    listMembresias: (f) => run((db) => {
      needUser(db);
      return db.membresias.map((m) => withEstado(m))
        .filter((m) => (!f?.estado || m.estado === f.estado) && (!f?.cliente_id || m.cliente_id === f.cliente_id));
    }),
    crearMembresia: (data) => mutate((db) => {
      needUser(db);
      const plan = db.planes.find((p) => p.id === data.plan_id);
      if (!plan) throw new ApiError(404, 'Plan no encontrado');
      const venc = isoDate(new Date(Date.parse(data.fecha_inicio) + plan.duracion_dias * DAY));
      const m: Membresia = { id: uid('mem'), ...data, fecha_vencimiento: venc, estado: 'activa' };
      db.membresias.push(m); return withEstado(m);
    }),

    listPagos: (membresia_id) => run((db) => { needUser(db); return db.pagos.filter((p) => !membresia_id || p.membresia_id === membresia_id); }),
    registrarPago: (data) => mutate((db) => {
      const user = needUser(db);
      const m = db.membresias.find((x) => x.id === data.membresia_id);
      if (!m) throw new ApiError(404, 'Membresía no encontrada');
      if (data.monto <= 0) throw new ApiError(422, 'El monto debe ser mayor que cero');
      const plan = db.planes.find((p) => p.id === m.plan_id)!;
      // Regla: pagar extiende el vencimiento; si ya venció, cuenta desde hoy.
      const hoy = isoDate(now());
      const desde = m.fecha_vencimiento >= hoy ? m.fecha_vencimiento : hoy;
      const hasta = isoDate(new Date(Date.parse(desde) + plan.duracion_dias * DAY));
      m.fecha_vencimiento = hasta;
      if (m.estado === 'cancelada') m.estado = 'activa';
      const pago = { id: uid('pag'), ...data, periodo_desde: desde, periodo_hasta: hasta, registrado_por: user.id, creado_en: now().toISOString() };
      db.pagos.push(pago);
      return { pago, membresia: withEstado(m) };
    }),

    registrarEntrada: (placa) => mutate((db) => {
      const user = needUser(db);
      const moto = motoPorPlaca(db, placa);
      if (db.estancias.some((e) => e.moto_id === moto.id && !e.salida_en)) throw new ApiError(409, 'La moto ya está dentro del parqueadero');
      const e = { id: uid('est'), moto_id: moto.id, entrada_en: now().toISOString(), salida_en: null, operador_entrada: user.id, operador_salida: null };
      db.estancias.push(e); return e;
    }),
    registrarSalida: (placa) => mutate((db) => {
      const user = needUser(db);
      const moto = motoPorPlaca(db, placa);
      const e = db.estancias.find((x) => x.moto_id === moto.id && !x.salida_en);
      if (!e) throw new ApiError(409, 'La moto no tiene una entrada abierta');
      e.salida_en = now().toISOString(); e.operador_salida = user.id; return e;
    }),
    listDentro: () => run((db) => { needUser(db); return db.estancias.filter((e) => !e.salida_en); }),
    historialAccesos: () => run((db) => { needUser(db); return [...db.estancias].sort((a, b) => b.entrada_en.localeCompare(a.entrada_en)); }),

    resumen: () => run((db) => {
      needUser(db);
      const hoy = isoDate(now());
      const pagosHoy = db.pagos.filter((p) => p.creado_en.slice(0, 10) === hoy);
      return {
        motos_dentro: db.estancias.filter((e) => !e.salida_en).length,
        membresias_por_vencer: db.membresias.filter((m) => calcularEstado(m, now()) === 'por_vencer').length,
        pagos_hoy: pagosHoy.length,
        total_hoy: pagosHoy.reduce((s, p) => s + p.monto, 0),
      };
    }),
  };
}
