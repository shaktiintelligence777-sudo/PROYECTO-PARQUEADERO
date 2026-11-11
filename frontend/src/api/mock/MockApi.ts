import {
  ErrorApi, type AccesoEntrada, type AccesoRegistrado, type ApiClient, type CodigoError, type ClienteCrear, type ClienteDetalle,
  type ClienteEditar, type ClienteResumen, type Configuracion, type ConfiguracionEditar, type ConsultaPlaca, type DashboardResumen,
  type DetalleError, type Estancia, type FiltrosClientes, type FiltrosExportacion, type FiltrosHistorial, type FiltrosMembresias,
  type FiltrosMotos, type FiltrosNotificaciones, type FiltrosPagos, type FiltrosPaginacion, type FiltrosPlanes, type FiltrosUsuarios,
  type LoginEntrada, type Membresia, type MembresiaCrear, type MembresiaResumen, type Moto, type MotoConCliente, type MotoCrear,
  type MotoEditar, type MotivoEntrada, type Notificacion, type Pagina, type Pago, type PagoCrear, type PagoRegistrado,
  type PagoVistaPrevia, type Plan, type PlanCrear, type PlanEditar, type RefreshEntrada, type Sesion, type Usuario, type UsuarioCrear,
  type UsuarioEditar, type EstadoMembresia, type VisitanteCasualEntrada,
} from '../client';
import { guardarDb, leerDb, reiniciarDb } from './almacen';
import { nuevoId } from './ids';
import type { Db, FilaCliente, FilaEstancia, FilaMembresia, FilaMoto, FilaPago, FilaPlan, FilaUsuario } from './modelo';
import {
  PLACA_VALIDA, advertenciasDeEstado, diasRestantes, diferenciaDias, estadoMembresia, normalizarPlaca, periodoDePago, plano,
  sumarDias, vencimientoInicial,
} from './reglas';
import { relojReal, fechaBogota, type Reloj } from './reloj';
import { Sesiones } from './sesiones';
import { Validador } from './validador';

export interface OpcionesMock {
  almacenamiento?: Storage;
  sesion?: Storage;
  reloj?: Reloj;
  /** Espera simulada en ms por llamada. Por defecto, entre 150 y 400. En pruebas: 0. */
  espera?: number | (() => number);
}

const RE_DOCUMENTO = /^[A-Za-z0-9]{5,20}$/;
const RE_TELEFONO = /^\+?[0-9]{7,15}$/;
const METODOS = ['efectivo', 'transferencia', 'otro'] as const;
const ESTADOS = ['activa', 'por_vencer', 'vencida', 'cancelada'] as const;
const VARIABLES_PLANTILLA = ['nombre', 'plan', 'fecha_vencimiento', 'precio', 'parqueadero'];
const MAX_INTENTOS = 5;
const VENTANA_INTENTOS_MS = 15 * 60_000;

const err = (status: number, codigo: CodigoError, mensaje: string, detalles?: DetalleError[]) => new ErrorApi(status, codigo, mensaje, detalles);
const noEncontrado = (que: string) => err(404, 'no_encontrado', `${que} no encontrado.`);
const orden = (a: string, b: string) => plano(a).localeCompare(plano(b), 'es');

type Ctx = { db: Db; usuario: FilaUsuario };

export class MockApi implements ApiClient {
  private readonly almacenamiento: Storage;
  private readonly reloj: Reloj;
  private readonly sesiones: Sesiones;
  private readonly espera: () => number;
  private token: string | null = null;
  private readonly fallos = new Map<string, number[]>();

  constructor(opciones: OpcionesMock = {}) {
    this.almacenamiento = opciones.almacenamiento ?? window.localStorage;
    this.sesiones = new Sesiones(opciones.sesion ?? window.sessionStorage);
    this.reloj = opciones.reloj ?? relojReal;
    const e = opciones.espera;
    this.espera = typeof e === 'function' ? e : e !== undefined ? () => e : () => 150 + Math.random() * 250;
  }

  /** Borra los datos del demo y vuelve a sembrar. */
  reiniciarDemo(): void { reiniciarDb(this.almacenamiento, this.reloj); }

  establecerToken(token: string | null): void { this.token = token; }

  // ----------------------------------------------------------------- infraestructura
  private async ejecutar<T>(fn: (c: Ctx) => T, rol: 'todos' | 'admin' = 'todos'): Promise<T> {
    const ms = this.espera();
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    const db = leerDb(this.almacenamiento, this.reloj);
    const usuario = this.autenticar(db, rol);
    const resultado = fn({ db, usuario });
    guardarDb(this.almacenamiento, db);
    return resultado;
  }

  private async publico<T>(fn: (db: Db) => T): Promise<T> {
    const ms = this.espera();
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    const db = leerDb(this.almacenamiento, this.reloj);
    const resultado = fn(db);
    guardarDb(this.almacenamiento, db);
    return resultado;
  }

  private autenticar(db: Db, rol: 'todos' | 'admin'): FilaUsuario {
    if (!this.token) throw err(401, 'no_autenticado', 'Inicia sesión para continuar.');
    const acceso = this.sesiones.acceso(this.token);
    if (!acceso || acceso.expira < this.reloj.ahora().getTime()) throw err(401, 'token_invalido', 'Tu sesión venció. Inicia sesión de nuevo.');
    const u = db.usuarios.find((x) => x.id === acceso.usuario_id);
    if (!u || !u.activo) throw err(401, 'token_invalido', 'Tu sesión venció. Inicia sesión de nuevo.');
    if (rol === 'admin' && u.rol !== 'admin') throw err(403, 'sin_permiso', 'No tienes permiso para esta acción.');
    return u;
  }

  private exigirAdmin(u: FilaUsuario): void {
    if (u.rol !== 'admin') throw err(403, 'sin_permiso', 'No tienes permiso para esta acción.');
  }

  private pagina<T>(items: T[], f: FiltrosPaginacion = {}): Pagina<T> {
    const v = new Validador();
    v.entero('pagina', f.pagina, 1, Number.MAX_SAFE_INTEGER, false);
    v.entero('por_pagina', f.por_pagina, 1, 100, false);
    v.verificar();
    const pagina = f.pagina ?? 1;
    const por = f.por_pagina ?? 20;
    return { items: items.slice((pagina - 1) * por, pagina * por), total: items.length, pagina, por_pagina: por };
  }

  // ----------------------------------------------------------------- vistas
  private usuarioVista(u: FilaUsuario): Usuario {
    return { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, activo: u.activo, creado_en: u.creado_en };
  }
  private usuarioRef(db: Db, id: string) {
    return { id, nombre: db.usuarios.find((u) => u.id === id)?.nombre ?? 'Usuario eliminado' };
  }
  private clienteRef(c: FilaCliente) { return { id: c.id, nombre: c.nombre, documento: c.documento, telefono: c.telefono }; }
  private planRef(p: FilaPlan) { return { id: p.id, nombre: p.nombre, duracion_dias: p.duracion_dias, precio: p.precio }; }
  private plan(db: Db, id: string): FilaPlan { const p = db.planes.find((x) => x.id === id); if (!p) throw noEncontrado('Plan'); return p; }
  private cliente(db: Db, id: string): FilaCliente { const c = db.clientes.find((x) => x.id === id); if (!c) throw noEncontrado('Cliente'); return c; }

  private estado(db: Db, m: FilaMembresia): EstadoMembresia {
    return estadoMembresia(m, this.reloj.hoy(), db.configuracion.dias_por_vencer);
  }
  /** Membresía no cancelada del cliente (RN-30). */
  private membresiaActual(db: Db, clienteId: string): FilaMembresia | undefined {
    return db.membresias.find((m) => m.cliente_id === clienteId && !m.cancelada_en);
  }
  private resumen(db: Db, m: FilaMembresia | undefined): MembresiaResumen | null {
    if (!m) return null;
    return {
      id: m.id, plan: this.planRef(this.plan(db, m.plan_id)), fecha_vencimiento: m.fecha_vencimiento,
      estado: this.estado(db, m), dias_restantes: diasRestantes(m.fecha_vencimiento, this.reloj.hoy()),
    };
  }
  private membresiaVista(db: Db, m: FilaMembresia): Membresia {
    return {
      id: m.id, cliente: this.clienteRef(this.cliente(db, m.cliente_id)), plan: this.planRef(this.plan(db, m.plan_id)),
      placas: this.placasActivas(db, m.cliente_id), fecha_inicio: m.fecha_inicio, fecha_vencimiento: m.fecha_vencimiento,
      estado: this.estado(db, m), dias_restantes: diasRestantes(m.fecha_vencimiento, this.reloj.hoy()),
      cancelada_en: m.cancelada_en, motivo_cancelacion: m.motivo_cancelacion, creado_en: m.creado_en,
    };
  }
  private placasActivas(db: Db, clienteId: string): string[] {
    return db.motos.filter((m) => m.cliente_id === clienteId && m.activo).map((m) => m.placa).sort();
  }
  private dentro(db: Db, motoId: string): boolean { return db.estancias.some((e) => e.moto_id === motoId && !e.salida_en); }
  private motoVista(db: Db, m: FilaMoto): Moto {
    return { id: m.id, cliente_id: m.cliente_id, placa: m.placa, marca: m.marca, color: m.color, activo: m.activo, dentro: this.dentro(db, m.id), creado_en: m.creado_en };
  }
  private clienteBase(c: FilaCliente) {
    return { id: c.id, nombre: c.nombre, documento: c.documento, telefono: c.telefono, email: c.email, notas: c.notas, activo: c.activo, creado_en: c.creado_en };
  }
  private clienteResumen(db: Db, c: FilaCliente): ClienteResumen {
    return { ...this.clienteBase(c), placas: this.placasActivas(db, c.id), membresia: this.resumen(db, this.membresiaActual(db, c.id)) };
  }
  private clienteDetalle(db: Db, c: FilaCliente): ClienteDetalle {
    const motos = db.motos.filter((m) => m.cliente_id === c.id)
      .sort((a, b) => Number(b.activo) - Number(a.activo) || a.placa.localeCompare(b.placa)).map((m) => this.motoVista(db, m));
    return { ...this.clienteBase(c), motos, membresia: this.resumen(db, this.membresiaActual(db, c.id)) };
  }
  /** Placa de la estancia, sea de una moto registrada o de un visitante casual. */
  private placaDe(db: Db, e: FilaEstancia): string { return e.visitante ? e.visitante.placa : db.motos.find((m) => m.id === e.moto_id)!.placa; }
  private estanciaVista(db: Db, e: FilaEstancia): Estancia {
    const v = e.visitante;
    const moto = v ? null : db.motos.find((m) => m.id === e.moto_id)!;
    const fin = e.salida_en ? new Date(e.salida_en).getTime() : this.reloj.ahora().getTime();
    return {
      id: e.id,
      moto: v ? { id: e.id, placa: v.placa, marca: v.marca, color: v.color } : { id: moto!.id, placa: moto!.placa, marca: moto!.marca, color: moto!.color },
      cliente: v ? { id: e.id, nombre: v.nombre ?? 'Visitante casual', documento: '', telefono: '' } : this.clienteRef(this.cliente(db, moto!.cliente_id)),
      entrada_en: e.entrada_en, salida_en: e.salida_en,
      duracion_minutos: Math.max(0, Math.floor((fin - new Date(e.entrada_en).getTime()) / 60_000)),
      operador_entrada: this.usuarioRef(db, e.operador_entrada),
      operador_salida: e.operador_salida ? this.usuarioRef(db, e.operador_salida) : null,
    };
  }
  private pagoVista(db: Db, p: FilaPago): Pago {
    const m = db.membresias.find((x) => x.id === p.membresia_id)!;
    return {
      id: p.id, membresia_id: p.membresia_id, cliente: this.clienteRef(this.cliente(db, m.cliente_id)),
      plan: this.planRef(this.plan(db, p.plan_id)), monto: p.monto, metodo: p.metodo, periodos: p.periodos,
      periodo_desde: p.periodo_desde, periodo_hasta: p.periodo_hasta, nota: p.nota, registrado_por: this.usuarioRef(db, p.registrado_por),
      creado_en: p.creado_en, anulado: p.anulado, anulado_en: p.anulado_en,
      anulado_por: p.anulado_por ? this.usuarioRef(db, p.anulado_por) : null, motivo_anulacion: p.motivo_anulacion,
    };
  }
  private planVista(p: FilaPlan): Plan { return { ...p }; }

  // ----------------------------------------------------------------- auth
  login(datos: LoginEntrada): Promise<Sesion> {
    return this.publico((db) => {
      const v = new Validador();
      v.email('email', datos?.email);
      v.texto('password', datos?.password, 1, 128);
      v.verificar();
      const email = datos.email.trim().toLowerCase();
      const ahora = this.reloj.ahora().getTime();
      const recientes = (this.fallos.get(email) ?? []).filter((t) => ahora - t < VENTANA_INTENTOS_MS);
      if (recientes.length >= MAX_INTENTOS) throw err(429, 'demasiados_intentos', 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.');
      const u = db.usuarios.find((x) => x.email === email);
      if (!u || !u.activo || u.password !== datos.password) {
        recientes.push(ahora);
        this.fallos.set(email, recientes);
        throw err(401, 'credenciales_invalidas', 'Correo o contraseña incorrectos.');
      }
      this.fallos.delete(email);
      return { ...this.sesiones.emitir(u.id, ahora), token_type: 'bearer' as const, usuario: this.usuarioVista(u) };
    });
  }

  refrescarSesion(datos: RefreshEntrada): Promise<Sesion> {
    return this.publico((db) => {
      const v = new Validador();
      v.texto('refresh_token', datos?.refresh_token, 20, 512);
      v.verificar();
      const r = this.sesiones.consumirRefresco(datos.refresh_token);
      if (r === 'reutilizado' || r === 'desconocido') throw err(401, 'token_invalido', 'Tu sesión venció. Inicia sesión de nuevo.');
      const u = db.usuarios.find((x) => x.id === r.usuario_id);
      if (!u || !u.activo) throw err(401, 'token_invalido', 'Tu sesión venció. Inicia sesión de nuevo.');
      return { ...this.sesiones.emitir(u.id, this.reloj.ahora().getTime()), token_type: 'bearer' as const, usuario: this.usuarioVista(u) };
    });
  }

  logout(datos: RefreshEntrada): Promise<void> {
    return this.publico(() => {
      const v = new Validador();
      v.texto('refresh_token', datos?.refresh_token, 20, 512);
      v.verificar();
      this.sesiones.olvidarRefresco(datos.refresh_token);
    });
  }

  usuarioActual(): Promise<Usuario> { return this.ejecutar(({ usuario }) => this.usuarioVista(usuario)); }

  cambiarPassword(datos: { password_actual: string; password_nueva: string }): Promise<void> {
    return this.ejecutar(({ usuario }) => {
      const v = new Validador();
      v.texto('password_actual', datos?.password_actual, 1, 128);
      v.texto('password_nueva', datos?.password_nueva, 8, 128);
      v.verificar();
      if (usuario.password !== datos.password_actual) throw err(400, 'password_incorrecta', 'La contraseña actual no coincide.');
      usuario.password = datos.password_nueva;
      this.sesiones.revocarUsuario(usuario.id);
    });
  }

  // ----------------------------------------------------------------- usuarios
  listarUsuarios(f: FiltrosUsuarios = {}): Promise<Pagina<Usuario>> {
    return this.ejecutar(({ db }) => {
      const lista = db.usuarios.filter((u) => f.activo === undefined || u.activo === f.activo)
        .sort((a, b) => orden(a.nombre, b.nombre)).map((u) => this.usuarioVista(u));
      return this.pagina(lista, f);
    }, 'admin');
  }

  crearUsuario(d: UsuarioCrear): Promise<Usuario> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.email('email', d?.email);
      v.texto('nombre', d?.nombre, 2, 80);
      v.enumerado('rol', d?.rol, ['admin', 'operador']);
      v.texto('password', d?.password, 8, 128);
      v.verificar();
      const email = d.email.trim().toLowerCase();
      if (db.usuarios.some((u) => u.email === email)) {
        throw err(409, 'email_duplicado', 'Ya existe un usuario con ese correo.', [{ campo: 'email', mensaje: 'Ya está en uso.' }]);
      }
      const fila: FilaUsuario = { id: nuevoId(), email, nombre: d.nombre.trim(), rol: d.rol, activo: true, password: d.password, creado_en: this.reloj.ahora().toISOString() };
      db.usuarios.push(fila);
      return this.usuarioVista(fila);
    }, 'admin');
  }

  editarUsuario(id: string, d: UsuarioEditar): Promise<Usuario> {
    return this.ejecutar(({ db, usuario }) => {
      const v = new Validador();
      if (!d || Object.keys(d).length === 0) v.falla('cuerpo', 'Envía al menos un campo.');
      v.email('email', d?.email, false);
      v.texto('nombre', d?.nombre, 2, 80, false);
      v.enumerado('rol', d?.rol, ['admin', 'operador'], false);
      v.texto('password', d?.password, 8, 128, false);
      v.verificar();
      const u = db.usuarios.find((x) => x.id === id);
      if (!u) throw noEncontrado('Usuario');
      const email = d.email?.trim().toLowerCase();
      if (email && db.usuarios.some((x) => x.id !== id && x.email === email)) {
        throw err(409, 'email_duplicado', 'Ya existe un usuario con ese correo.', [{ campo: 'email', mensaje: 'Ya está en uso.' }]);
      }
      const dejaDeSerAdminActivo = u.rol === 'admin' && u.activo && (d.activo === false || (d.rol !== undefined && d.rol !== 'admin'));
      if (d.activo === false && u.id === usuario.id) throw err(409, 'auto_desactivacion', 'No puedes desactivar tu propio usuario.');
      if (dejaDeSerAdminActivo && db.usuarios.filter((x) => x.rol === 'admin' && x.activo).length <= 1) {
        throw err(409, 'ultimo_admin', 'Debe quedar al menos un administrador activo.');
      }
      if (email) u.email = email;
      if (d.nombre !== undefined) u.nombre = d.nombre.trim();
      if (d.rol !== undefined) u.rol = d.rol;
      if (d.activo !== undefined) u.activo = d.activo;
      if (d.password !== undefined) u.password = d.password;
      if (d.activo === false || d.password !== undefined) this.sesiones.revocarUsuario(u.id);
      return this.usuarioVista(u);
    }, 'admin');
  }

  // ----------------------------------------------------------------- clientes
  listarClientes(f: FiltrosClientes = {}): Promise<Pagina<ClienteResumen>> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.texto('q', f.q, 1, 80, false);
      v.enumerado('estado_membresia', f.estado_membresia, ['activa', 'por_vencer', 'vencida', 'sin_membresia'], false);
      v.verificar();
      const activo = f.activo ?? true;
      const q = f.q ? plano(f.q.trim()) : '';
      const placaQ = f.q ? normalizarPlaca(f.q) : '';
      const lista = db.clientes.filter((c) => {
        if (c.activo !== activo) return false;
        if (q) {
          const porPlaca = placaQ !== '' && db.motos.some((m) => m.cliente_id === c.id && m.placa.startsWith(placaQ));
          if (!plano(c.nombre).includes(q) && !c.documento.startsWith(f.q!.trim()) && !porPlaca) return false;
        }
        if (f.estado_membresia) {
          const m = this.membresiaActual(db, c.id);
          if (f.estado_membresia === 'sin_membresia') return !m;
          return !!m && this.estado(db, m) === f.estado_membresia;
        }
        return true;
      }).sort((a, b) => orden(a.nombre, b.nombre)).map((c) => this.clienteResumen(db, c));
      return this.pagina(lista, f);
    });
  }

  crearCliente(d: ClienteCrear): Promise<ClienteDetalle> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.texto('nombre', d?.nombre, 2, 120);
      v.patron('documento', d?.documento, RE_DOCUMENTO, 'Entre 5 y 20 letras o números, sin puntos ni espacios.');
      v.patron('telefono', d?.telefono, RE_TELEFONO, 'Entre 7 y 15 dígitos, con + inicial opcional.', false);
      v.email('email', d?.email, false);
      v.texto('notas', d?.notas, 0, 500, false);
      if ((d?.motos?.length ?? 0) > 5) v.falla('motos', 'Máximo 5 motos.');
      const placas = (d?.motos ?? []).map((m, i) => {
        const p = normalizarPlaca(m?.placa ?? '');
        if (!PLACA_VALIDA.test(p)) v.falla(`motos.${i}.placa`, 'La placa debe tener entre 4 y 7 letras o números.');
        v.texto(`motos.${i}.marca`, m?.marca, 0, 40, false);
        v.texto(`motos.${i}.color`, m?.color, 0, 30, false);
        return p;
      });
      v.verificar();
      if (db.clientes.some((c) => c.documento === d.documento)) {
        throw err(409, 'documento_duplicado', 'Ya existe un cliente con ese documento.', [{ campo: 'documento', mensaje: 'Ya está registrado.' }]);
      }
      const repetidas: DetalleError[] = [];
      placas.forEach((p, i) => {
        if (db.motos.some((m) => m.placa === p) || placas.indexOf(p) !== i) repetidas.push({ campo: `motos.${i}.placa`, mensaje: 'Esta placa ya está registrada.' });
      });
      if (repetidas.length) throw err(409, 'placa_duplicada', 'Una de las placas ya está registrada.', repetidas);
      const ahora = this.reloj.ahora().toISOString();
      const c: FilaCliente = {
        id: nuevoId(), nombre: d.nombre.trim(), documento: d.documento, telefono: d.telefono ?? '', email: d.email?.trim() || null,
        notas: d.notas?.trim() || null, activo: true, creado_en: ahora,
      };
      db.clientes.push(c);
      (d.motos ?? []).forEach((m, i) => {
        db.motos.push({ id: nuevoId(), cliente_id: c.id, placa: placas[i]!, marca: m.marca?.trim() || null, color: m.color?.trim() || null, activo: true, creado_en: ahora });
      });
      return this.clienteDetalle(db, c);
    });
  }

  obtenerCliente(id: string): Promise<ClienteDetalle> {
    return this.ejecutar(({ db }) => this.clienteDetalle(db, this.cliente(db, id)));
  }

  editarCliente(id: string, d: ClienteEditar): Promise<ClienteDetalle> {
    return this.ejecutar(({ db, usuario }) => {
      const v = new Validador();
      if (!d || Object.keys(d).length === 0) v.falla('cuerpo', 'Envía al menos un campo.');
      v.texto('nombre', d?.nombre, 2, 120, false);
      v.patron('documento', d?.documento, RE_DOCUMENTO, 'Entre 5 y 20 letras o números, sin puntos ni espacios.', false);
      v.patron('telefono', d?.telefono, RE_TELEFONO, 'Entre 7 y 15 dígitos, con + inicial opcional.', false);
      v.email('email', d?.email, false);
      v.texto('notas', d?.notas, 0, 500, false);
      v.verificar();
      const c = this.cliente(db, id);
      if (d.activo !== undefined) this.exigirAdmin(usuario);
      if (d.documento && db.clientes.some((x) => x.id !== id && x.documento === d.documento)) {
        throw err(409, 'documento_duplicado', 'Ya existe un cliente con ese documento.', [{ campo: 'documento', mensaje: 'Ya está registrado.' }]);
      }
      if (d.activo === false && db.motos.some((m) => m.cliente_id === id && this.dentro(db, m.id))) {
        throw err(409, 'cliente_con_moto_dentro', 'El cliente tiene una moto dentro del parqueadero.');
      }
      if (d.nombre !== undefined) c.nombre = d.nombre.trim();
      if (d.documento !== undefined) c.documento = d.documento;
      if (d.telefono !== undefined) c.telefono = d.telefono;
      if (d.email !== undefined) c.email = d.email?.trim() || null;
      if (d.notas !== undefined) c.notas = d.notas?.trim() || null;
      if (d.activo !== undefined) {
        c.activo = d.activo;
        if (!d.activo) db.motos.filter((m) => m.cliente_id === id).forEach((m) => { m.activo = false; });
      }
      return this.clienteDetalle(db, c);
    });
  }

  // ----------------------------------------------------------------- motos
  listarMotos(f: FiltrosMotos = {}): Promise<Pagina<MotoConCliente>> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.texto('placa', f.placa, 1, 10, false);
      v.verificar();
      const placa = f.placa ? normalizarPlaca(f.placa) : '';
      const lista = db.motos
        .filter((m) => m.activo === (f.activo ?? true) && (!placa || m.placa.startsWith(placa)) && (!f.cliente_id || m.cliente_id === f.cliente_id))
        .sort((a, b) => a.placa.localeCompare(b.placa))
        .map((m) => ({ ...this.motoVista(db, m), cliente: this.clienteRef(this.cliente(db, m.cliente_id)) }));
      return this.pagina(lista, f);
    });
  }

  crearMoto(d: MotoCrear): Promise<Moto> {
    return this.ejecutar(({ db }) => {
      const placa = normalizarPlaca(d?.placa ?? '');
      const v = new Validador();
      v.texto('cliente_id', d?.cliente_id, 1, 60);
      if (!PLACA_VALIDA.test(placa)) v.falla('placa', 'La placa debe tener entre 4 y 7 letras o números.');
      v.texto('marca', d?.marca, 0, 40, false);
      v.texto('color', d?.color, 0, 30, false);
      v.verificar();
      this.cliente(db, d.cliente_id);
      if (db.motos.some((m) => m.placa === placa)) {
        throw err(409, 'placa_duplicada', 'Ya existe una moto con esa placa.', [{ campo: 'placa', mensaje: 'Ya está registrada.' }]);
      }
      const fila: FilaMoto = { id: nuevoId(), cliente_id: d.cliente_id, placa, marca: d.marca?.trim() || null, color: d.color?.trim() || null, activo: true, creado_en: this.reloj.ahora().toISOString() };
      db.motos.push(fila);
      return this.motoVista(db, fila);
    });
  }

  editarMoto(id: string, d: MotoEditar): Promise<Moto> {
    return this.ejecutar(({ db, usuario }) => {
      const v = new Validador();
      if (!d || Object.keys(d).length === 0) v.falla('cuerpo', 'Envía al menos un campo.');
      const placa = d?.placa !== undefined ? normalizarPlaca(d.placa) : undefined;
      if (placa !== undefined && !PLACA_VALIDA.test(placa)) v.falla('placa', 'La placa debe tener entre 4 y 7 letras o números.');
      v.texto('marca', d?.marca, 0, 40, false);
      v.texto('color', d?.color, 0, 30, false);
      v.verificar();
      const m = db.motos.find((x) => x.id === id);
      if (!m) throw noEncontrado('Moto');
      if (d.activo !== undefined || d.cliente_id !== undefined) this.exigirAdmin(usuario);
      if (placa && db.motos.some((x) => x.id !== id && x.placa === placa)) {
        throw err(409, 'placa_duplicada', 'Ya existe una moto con esa placa.', [{ campo: 'placa', mensaje: 'Ya está registrada.' }]);
      }
      if (d.activo === false && this.dentro(db, id)) throw err(409, 'moto_dentro', 'La moto está dentro del parqueadero.');
      if (d.cliente_id !== undefined) { this.cliente(db, d.cliente_id); m.cliente_id = d.cliente_id; }
      if (placa) m.placa = placa;
      if (d.marca !== undefined) m.marca = d.marca?.trim() || null;
      if (d.color !== undefined) m.color = d.color?.trim() || null;
      if (d.activo !== undefined) m.activo = d.activo;
      return this.motoVista(db, m);
    });
  }

  // ----------------------------------------------------------------- planes
  listarPlanes(f: FiltrosPlanes = {}): Promise<{ items: Plan[] }> {
    return this.ejecutar(({ db }) => ({
      items: db.planes.filter((p) => f.activo === undefined || p.activo === f.activo)
        .sort((a, b) => b.duracion_dias - a.duracion_dias || a.nombre.localeCompare(b.nombre)).map((p) => this.planVista(p)),
    }));
  }

  crearPlan(d: PlanCrear): Promise<Plan> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.texto('nombre', d?.nombre, 2, 60);
      v.entero('duracion_dias', d?.duracion_dias, 1, 366);
      v.entero('precio', d?.precio, 1, 100_000_000);
      v.verificar();
      this.nombrePlanLibre(db, d.nombre);
      const p: FilaPlan = { id: nuevoId(), nombre: d.nombre.trim(), duracion_dias: d.duracion_dias, precio: d.precio, activo: true, creado_en: this.reloj.ahora().toISOString() };
      db.planes.push(p);
      return this.planVista(p);
    }, 'admin');
  }

  editarPlan(id: string, d: PlanEditar): Promise<Plan> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      if (!d || Object.keys(d).length === 0) v.falla('cuerpo', 'Envía al menos un campo.');
      v.texto('nombre', d?.nombre, 2, 60, false);
      v.entero('duracion_dias', d?.duracion_dias, 1, 366, false);
      v.entero('precio', d?.precio, 1, 100_000_000, false);
      v.verificar();
      const p = this.plan(db, id);
      if (d.nombre !== undefined) { this.nombrePlanLibre(db, d.nombre, id); p.nombre = d.nombre.trim(); }
      if (d.duracion_dias !== undefined) p.duracion_dias = d.duracion_dias;
      if (d.precio !== undefined) p.precio = d.precio; // RN-22: no altera pagos ya registrados
      if (d.activo !== undefined) p.activo = d.activo;
      return this.planVista(p);
    }, 'admin');
  }

  private nombrePlanLibre(db: Db, nombre: string, excepto?: string): void {
    if (db.planes.some((p) => p.id !== excepto && plano(p.nombre) === plano(nombre.trim()))) {
      throw err(409, 'nombre_duplicado', 'Ya existe un plan con ese nombre.', [{ campo: 'nombre', mensaje: 'Ya está en uso.' }]);
    }
  }

  // ----------------------------------------------------------------- membresías
  listarMembresias(f: FiltrosMembresias = {}): Promise<Pagina<Membresia>> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.enumerado('estado', f.estado, ESTADOS, false);
      v.texto('q', f.q, 1, 80, false);
      v.verificar();
      const q = f.q ? plano(f.q.trim()) : '';
      const placaQ = f.q ? normalizarPlaca(f.q) : '';
      const lista = db.membresias
        .filter((m) => {
          if (f.estado && this.estado(db, m) !== f.estado) return false;
          if (!f.estado && !f.cliente_id && m.cancelada_en) return false; // sin filtro: solo las no canceladas (contrato)
          if (f.cliente_id && m.cliente_id !== f.cliente_id) return false;
          if (q) {
            const c = this.cliente(db, m.cliente_id);
            const porPlaca = placaQ !== '' && db.motos.some((x) => x.cliente_id === c.id && x.placa.startsWith(placaQ));
            if (!plano(c.nombre).includes(q) && !c.documento.startsWith(f.q!.trim()) && !porPlaca) return false;
          }
          return true;
        })
        .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
        .map((m) => this.membresiaVista(db, m));
      return this.pagina(lista, f);
    });
  }

  crearMembresia(d: MembresiaCrear): Promise<Membresia> {
    return this.ejecutar(({ db, usuario }) => {
      const hoy = this.reloj.hoy();
      const v = new Validador();
      v.texto('cliente_id', d?.cliente_id, 1, 60);
      v.texto('plan_id', d?.plan_id, 1, 60);
      v.fecha('fecha_inicio', d?.fecha_inicio, false);
      v.entero('pago_inicial.monto', d?.pago_inicial?.monto, 1, 100_000_000);
      v.enumerado('pago_inicial.metodo', d?.pago_inicial?.metodo, METODOS);
      v.texto('pago_inicial.nota', d?.pago_inicial?.nota, 0, 300, false);
      if (d?.fecha_inicio && Math.abs(diferenciaDias(d.fecha_inicio, hoy)) > 31) v.falla('fecha_inicio', 'Debe estar entre 31 días antes y 31 días después de hoy.');
      v.verificar();
      const cliente = this.cliente(db, d.cliente_id);
      const plan = this.plan(db, d.plan_id);
      if (!plan.activo) throw err(409, 'plan_inactivo', 'Ese plan está inactivo.');
      if (this.membresiaActual(db, cliente.id)) throw err(409, 'membresia_existente', 'El cliente ya tiene una membresía.');
      if (d.pago_inicial.monto !== plan.precio && !d.pago_inicial.nota?.trim()) {
        throw err(422, 'validacion', 'Hay datos que corregir.', [{ campo: 'pago_inicial.nota', mensaje: 'Explica por qué el monto es distinto del precio del plan.' }]);
      }
      const inicio = d.fecha_inicio ?? hoy;
      const ahora = this.reloj.ahora().toISOString();
      const m: FilaMembresia = {
        id: nuevoId(), cliente_id: cliente.id, plan_id: plan.id, fecha_inicio: inicio,
        fecha_vencimiento: vencimientoInicial(inicio, plan.duracion_dias), cancelada_en: null, motivo_cancelacion: null, creado_en: ahora,
      };
      db.membresias.push(m);
      db.pagos.push({
        id: nuevoId(), membresia_id: m.id, plan_id: plan.id, monto: d.pago_inicial.monto, metodo: d.pago_inicial.metodo, periodos: 1,
        periodo_desde: inicio, periodo_hasta: m.fecha_vencimiento, nota: d.pago_inicial.nota?.trim() || null, registrado_por: usuario.id,
        creado_en: ahora, vencimiento_anterior: sumarDias(inicio, -1), anulado: false, anulado_en: null, anulado_por: null, motivo_anulacion: null,
      });
      return this.membresiaVista(db, m);
    });
  }

  obtenerMembresia(id: string): Promise<Membresia> {
    return this.ejecutar(({ db }) => this.membresiaVista(db, this.membresia(db, id)));
  }

  private membresia(db: Db, id: string): FilaMembresia {
    const m = db.membresias.find((x) => x.id === id);
    if (!m) throw noEncontrado('Membresía');
    return m;
  }

  cambiarPlanMembresia(id: string, d: { plan_id: string }): Promise<Membresia> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.texto('plan_id', d?.plan_id, 1, 60);
      v.verificar();
      const m = this.membresia(db, id);
      if (m.cancelada_en) throw err(409, 'membresia_cancelada', 'La membresía está cancelada.');
      const plan = this.plan(db, d.plan_id);
      if (!plan.activo) throw err(409, 'plan_inactivo', 'Ese plan está inactivo.');
      m.plan_id = plan.id; // RN-34: no cambia el vencimiento actual
      return this.membresiaVista(db, m);
    });
  }

  cancelarMembresia(id: string, d: MotivoEntrada): Promise<Membresia> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.texto('motivo', d?.motivo, 5, 300);
      v.verificar();
      const m = this.membresia(db, id);
      if (m.cancelada_en) throw err(409, 'membresia_cancelada', 'La membresía ya estaba cancelada.');
      m.cancelada_en = this.reloj.ahora().toISOString();
      m.motivo_cancelacion = d.motivo.trim();
      this.cancelarNotificacionesPendientes(db, m.id); // RN-35
      return this.membresiaVista(db, m);
    }, 'admin');
  }

  private cancelarNotificacionesPendientes(db: Db, membresiaId: string): void {
    db.notificaciones.filter((n) => n.membresia_id === membresiaId && n.estado === 'pendiente').forEach((n) => { n.estado = 'cancelada'; });
  }

  listarPagosDeMembresia(id: string, f: FiltrosPaginacion = {}): Promise<Pagina<Pago>> {
    return this.ejecutar(({ db }) => {
      this.membresia(db, id);
      const lista = db.pagos.filter((p) => p.membresia_id === id).sort((a, b) => b.creado_en.localeCompare(a.creado_en)).map((p) => this.pagoVista(db, p));
      return this.pagina(lista, f);
    });
  }

  // ----------------------------------------------------------------- pagos
  listarPagos(f: FiltrosPagos = {}): Promise<Pagina<Pago>> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.fecha('desde', f.desde, false);
      v.fecha('hasta', f.hasta, false);
      v.enumerado('metodo', f.metodo, METODOS, false);
      v.verificar();
      const lista = db.pagos.filter((p) => {
        if (!(f.incluir_anulados ?? true) && p.anulado) return false;
        if (f.metodo && p.metodo !== f.metodo) return false;
        const dia = fechaBogota(new Date(p.creado_en));
        if (f.desde && dia < f.desde) return false;
        if (f.hasta && dia > f.hasta) return false;
        if (f.cliente_id && db.membresias.find((m) => m.id === p.membresia_id)?.cliente_id !== f.cliente_id) return false;
        return true;
      }).sort((a, b) => b.creado_en.localeCompare(a.creado_en)).map((p) => this.pagoVista(db, p));
      return this.pagina(lista, f);
    });
  }

  /** Valida la membresía y calcula el periodo (RN-41, RN-44). */
  private calcularPago(db: Db, membresiaId: string, periodos: number) {
    const m = this.membresia(db, membresiaId);
    if (m.cancelada_en) throw err(409, 'membresia_cancelada', 'La membresía está cancelada.');
    const plan = this.plan(db, m.plan_id);
    if (!plan.activo) throw err(409, 'plan_inactivo', 'El plan de esta membresía está inactivo. Cámbialo antes de cobrar.');
    return { m, plan, ...periodoDePago(m.fecha_vencimiento, this.reloj.hoy(), plan.duracion_dias, periodos) };
  }

  previsualizarPago(d: { membresia_id: string; periodos?: number }): Promise<PagoVistaPrevia> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.texto('membresia_id', d?.membresia_id, 1, 60);
      v.entero('periodos', d?.periodos, 1, 12, false);
      v.verificar();
      const periodos = d.periodos ?? 1;
      const c = this.calcularPago(db, d.membresia_id, periodos);
      return {
        membresia_id: c.m.id, plan: this.planRef(c.plan), periodos, monto_sugerido: c.plan.precio * periodos,
        periodo_desde: c.periodo_desde, periodo_hasta: c.periodo_hasta, vencimiento_actual: c.m.fecha_vencimiento, vencimiento_nuevo: c.periodo_hasta,
      };
    });
  }

  registrarPago(d: PagoCrear): Promise<PagoRegistrado> {
    return this.ejecutar(({ db, usuario }) => {
      const v = new Validador();
      v.texto('membresia_id', d?.membresia_id, 1, 60);
      v.entero('monto', d?.monto, 1, 100_000_000);
      v.enumerado('metodo', d?.metodo, METODOS);
      v.entero('periodos', d?.periodos, 1, 12, false);
      v.texto('nota', d?.nota, 0, 300, false);
      v.verificar();
      const periodos = d.periodos ?? 1;
      const c = this.calcularPago(db, d.membresia_id, periodos);
      if (d.monto !== c.plan.precio * periodos && !d.nota?.trim()) { // RN-43
        throw err(422, 'validacion', 'Hay datos que corregir.', [{ campo: 'nota', mensaje: 'Explica por qué el monto es distinto del sugerido.' }]);
      }
      const fila: FilaPago = {
        id: nuevoId(), membresia_id: c.m.id, plan_id: c.plan.id, monto: d.monto, metodo: d.metodo, periodos,
        periodo_desde: c.periodo_desde, periodo_hasta: c.periodo_hasta, nota: d.nota?.trim() || null, registrado_por: usuario.id,
        creado_en: this.reloj.ahora().toISOString(), vencimiento_anterior: c.m.fecha_vencimiento,
        anulado: false, anulado_en: null, anulado_por: null, motivo_anulacion: null,
      };
      db.pagos.push(fila);
      c.m.fecha_vencimiento = c.periodo_hasta; // RN-42
      this.cancelarNotificacionesPendientes(db, c.m.id); // RN-63
      return { pago: this.pagoVista(db, fila), membresia: this.membresiaVista(db, c.m) };
    });
  }

  anularPago(id: string, d: MotivoEntrada): Promise<PagoRegistrado> {
    return this.ejecutar(({ db, usuario }) => {
      const v = new Validador();
      v.texto('motivo', d?.motivo, 5, 300);
      v.verificar();
      const p = db.pagos.find((x) => x.id === id);
      if (!p) throw noEncontrado('Pago');
      const vigentes = db.pagos.filter((x) => x.membresia_id === p.membresia_id && !x.anulado).sort((a, b) => a.creado_en.localeCompare(b.creado_en));
      const esUltimo = vigentes.at(-1)?.id === p.id;
      if (p.anulado || !esUltimo || vigentes.length === 1) { // RN-46
        throw err(409, 'pago_no_anulable', 'Solo se puede anular el último pago, y no el pago inicial de la membresía.');
      }
      const m = this.membresia(db, p.membresia_id);
      p.anulado = true;
      p.anulado_en = this.reloj.ahora().toISOString();
      p.anulado_por = usuario.id;
      p.motivo_anulacion = d.motivo.trim();
      m.fecha_vencimiento = p.vencimiento_anterior;
      return { pago: this.pagoVista(db, p), membresia: this.membresiaVista(db, m) };
    }, 'admin');
  }

  // ----------------------------------------------------------------- accesos
  private motoPorPlaca(db: Db, placaCruda: string): FilaMoto {
    const placa = normalizarPlaca(placaCruda ?? '');
    const v = new Validador();
    if (placa.length < 4 || placa.length > 10) v.falla('placa', 'La placa debe tener entre 4 y 7 letras o números.');
    v.verificar();
    const moto = db.motos.find((m) => m.placa === placa);
    const cliente = moto && db.clientes.find((c) => c.id === moto.cliente_id);
    if (!moto || !moto.activo || !cliente || !cliente.activo) { // RN-14, RN-51
      throw err(404, 'moto_no_registrada', `La placa ${placa} no está registrada.`);
    }
    return moto;
  }

  private estadoDeCliente(db: Db, clienteId: string): EstadoMembresia | null {
    const m = this.membresiaActual(db, clienteId);
    return m ? this.estado(db, m) : null;
  }

  /** Estancia abierta de un visitante casual con esa placa (la placa ya viene normalizada). */
  private casualAbierta(db: Db, placa: string): FilaEstancia | undefined {
    return db.estancias.find((e) => e.visitante?.placa === placa && !e.salida_en);
  }

  consultarPlaca(placa: string): Promise<ConsultaPlaca> {
    return this.ejecutar(({ db }) => {
      const abiertaCasual = this.casualAbierta(db, normalizarPlaca(placa ?? ''));
      if (abiertaCasual && !db.motos.some((m) => m.placa === abiertaCasual.visitante!.placa && m.activo)) {
        const est = this.estanciaVista(db, abiertaCasual);
        return {
          moto: { id: est.moto.id, cliente_id: est.cliente.id, placa: est.moto.placa, marca: est.moto.marca, color: est.moto.color, activo: true, dentro: true, creado_en: abiertaCasual.entrada_en },
          cliente: est.cliente, membresia: null, estancia_abierta: est, advertencias: [],
        };
      }
      const moto = this.motoPorPlaca(db, placa);
      const abierta = db.estancias.find((e) => e.moto_id === moto.id && !e.salida_en);
      return {
        moto: this.motoVista(db, moto), cliente: this.clienteRef(this.cliente(db, moto.cliente_id)),
        membresia: this.resumen(db, this.membresiaActual(db, moto.cliente_id)),
        estancia_abierta: abierta ? this.estanciaVista(db, abierta) : null,
        advertencias: advertenciasDeEstado(this.estadoDeCliente(db, moto.cliente_id)),
      };
    });
  }

  registrarEntrada(d: AccesoEntrada): Promise<AccesoRegistrado> {
    return this.ejecutar(({ db, usuario }) => {
      const moto = this.motoPorPlaca(db, d?.placa);
      if (this.dentro(db, moto.id)) throw err(409, 'moto_ya_dentro', 'Esa moto ya está dentro del parqueadero.'); // RN-50
      const e: FilaEstancia = { id: nuevoId(), moto_id: moto.id, entrada_en: this.reloj.ahora().toISOString(), salida_en: null, operador_entrada: usuario.id, operador_salida: null };
      db.estancias.push(e);
      return {
        estancia: this.estanciaVista(db, e), membresia: this.resumen(db, this.membresiaActual(db, moto.cliente_id)),
        advertencias: advertenciasDeEstado(this.estadoDeCliente(db, moto.cliente_id)), // RN-52: avisa, no bloquea
      };
    });
  }

  registrarEntradaCasual(d: VisitanteCasualEntrada): Promise<AccesoRegistrado> {
    return this.ejecutar(({ db, usuario }) => {
      const placa = normalizarPlaca(d?.placa ?? '');
      const v = new Validador();
      if (!PLACA_VALIDA.test(placa)) v.falla('placa', 'La placa debe tener entre 4 y 7 letras o números.');
      v.texto('marca', d?.marca, 1, 40);
      v.texto('color', d?.color, 1, 40);
      v.texto('nombre', d?.nombre, 1, 120, false);
      v.verificar();
      // Una placa de moto registrada se atiende como cliente normal; una placa ya dentro como visitante no se duplica (RN-50).
      if (db.motos.some((m) => m.placa === placa && m.activo)) throw err(409, 'placa_duplicada', 'Esa placa ya pertenece a un cliente con membresía.', [{ campo: 'placa', mensaje: 'Esa placa ya está registrada.' }]);
      if (this.casualAbierta(db, placa)) throw err(409, 'moto_ya_dentro', 'Esa moto ya está dentro del parqueadero.');
      const nombre = d.nombre?.trim();
      const e: FilaEstancia = {
        id: nuevoId(), moto_id: '', entrada_en: this.reloj.ahora().toISOString(), salida_en: null, operador_entrada: usuario.id, operador_salida: null,
        visitante: { placa, marca: d.marca.trim(), color: d.color.trim(), nombre: nombre ? nombre : null },
      };
      db.estancias.push(e);
      return { estancia: this.estanciaVista(db, e), membresia: null, advertencias: [] };
    });
  }

  registrarSalida(d: AccesoEntrada): Promise<AccesoRegistrado> {
    return this.ejecutar(({ db, usuario }) => {
      const casual = this.casualAbierta(db, normalizarPlaca(d?.placa ?? ''));
      if (casual) {
        casual.salida_en = this.reloj.ahora().toISOString();
        casual.operador_salida = usuario.id;
        return { estancia: this.estanciaVista(db, casual), membresia: null, advertencias: [] };
      }
      const moto = this.motoPorPlaca(db, d?.placa);
      const e = db.estancias.find((x) => x.moto_id === moto.id && !x.salida_en);
      if (!e) throw err(409, 'moto_no_esta_dentro', 'Esa moto no tiene una entrada abierta.'); // RN-53
      e.salida_en = this.reloj.ahora().toISOString();
      e.operador_salida = usuario.id;
      return { estancia: this.estanciaVista(db, e), membresia: this.resumen(db, this.membresiaActual(db, moto.cliente_id)), advertencias: [] };
    });
  }

  listarMotosDentro(f: { placa?: string } = {}): Promise<{ items: Estancia[]; total: number; capacidad: number | null }> {
    return this.ejecutar(({ db }) => {
      const placa = f.placa ? normalizarPlaca(f.placa) : '';
      const items = db.estancias.filter((e) => !e.salida_en && (!placa || this.placaDe(db, e).startsWith(placa)))
        .sort((a, b) => a.entrada_en.localeCompare(b.entrada_en)).map((e) => this.estanciaVista(db, e));
      return { items, total: items.length, capacidad: db.configuracion.capacidad };
    });
  }

  private filtrarHistorial(db: Db, f: FiltrosHistorial): Estancia[] {
    const placa = f.placa ? normalizarPlaca(f.placa) : '';
    return db.estancias.filter((e) => {
      const dia = fechaBogota(new Date(e.entrada_en));
      if (f.desde && dia < f.desde) return false;
      if (f.hasta && dia > f.hasta) return false;
      if (placa && !this.placaDe(db, e).startsWith(placa)) return false;
      if (f.operador_id && e.operador_entrada !== f.operador_id && e.operador_salida !== f.operador_id) return false;
      if (f.cliente_id && (e.visitante || db.motos.find((m) => m.id === e.moto_id)!.cliente_id !== f.cliente_id)) return false;
      return true;
    }).sort((a, b) => b.entrada_en.localeCompare(a.entrada_en)).map((e) => this.estanciaVista(db, e));
  }

  listarHistorialAccesos(f: FiltrosHistorial = {}): Promise<Pagina<Estancia>> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.fecha('desde', f.desde, false);
      v.fecha('hasta', f.hasta, false);
      v.texto('placa', f.placa, 1, 10, false);
      v.verificar();
      return this.pagina(this.filtrarHistorial(db, f), f);
    }, 'admin');
  }

  exportarHistorialAccesos(f: FiltrosExportacion): Promise<Blob> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.fecha('desde', f?.desde);
      v.fecha('hasta', f?.hasta);
      if (f?.desde && f?.hasta && (f.hasta < f.desde || diferenciaDias(f.hasta, f.desde) > 366)) v.falla('hasta', 'El rango debe ser de máximo 366 días.');
      v.verificar();
      const hora = (iso: string | null) => {
        if (!iso) return '';
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
        return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
      };
      // Inyección de fórmulas (B-08 regla 7, C-03 H-06): un texto que empieza por = + - @ se prefija con '.
      const celda = (s: string | number) => {
        const t = typeof s === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : String(s);
        return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const filas = this.filtrarHistorial(db, f).map((e) => [
        e.moto.placa, e.cliente.nombre, e.cliente.documento, hora(e.entrada_en), hora(e.salida_en), e.duracion_minutos,
        e.operador_entrada.nombre, e.operador_salida?.nombre ?? '',
      ].map(celda).join(','));
      const csv = ['placa,cliente,documento,entrada,salida,duracion_minutos,operador_entrada,operador_salida', ...filas].join('\n');
      return new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    }, 'admin');
  }

  // ----------------------------------------------------------------- dashboard y administración
  resumenDashboard(): Promise<DashboardResumen> {
    return this.ejecutar(({ db }) => {
      const hoy = this.reloj.hoy();
      const ahoraMs = this.reloj.ahora().getTime();
      const estados = db.membresias.map((m) => ({ m, e: this.estado(db, m) }));
      const cuenta = (e: EstadoMembresia) => estados.filter((x) => x.e === e).length;
      const pagosHoy = db.pagos.filter((p) => !p.anulado && fechaBogota(new Date(p.creado_en)) === hoy);
      const dentro = db.estancias.filter((e) => !e.salida_en);
      return {
        fecha: hoy,
        motos_dentro: dentro.length,
        capacidad: db.configuracion.capacidad,
        estancias_largas: dentro.filter((e) => ahoraMs - new Date(e.entrada_en).getTime() > 24 * 3600_000).length,
        entradas_hoy: db.estancias.filter((e) => fechaBogota(new Date(e.entrada_en)) === hoy).length,
        salidas_hoy: db.estancias.filter((e) => e.salida_en && fechaBogota(new Date(e.salida_en)) === hoy).length,
        membresias: { activas: cuenta('activa'), por_vencer: cuenta('por_vencer'), vencidas: cuenta('vencida') },
        pagos_hoy: { cantidad: pagosHoy.length, total: pagosHoy.reduce((s, p) => s + p.monto, 0) },
        proximos_vencimientos: estados.filter((x) => x.e === 'por_vencer' || x.e === 'vencida')
          .sort((a, b) => a.m.fecha_vencimiento.localeCompare(b.m.fecha_vencimiento)).slice(0, 5).map((x) => this.membresiaVista(db, x.m)),
      };
    });
  }

  listarNotificaciones(f: FiltrosNotificaciones = {}): Promise<Pagina<Notificacion>> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      v.enumerado('estado', f.estado, ['pendiente', 'enviada', 'fallida', 'cancelada'], false);
      v.fecha('desde', f.desde, false);
      v.fecha('hasta', f.hasta, false);
      v.verificar();
      const lista = db.notificaciones.filter((n) =>
        (!f.estado || n.estado === f.estado) && (!f.membresia_id || n.membresia_id === f.membresia_id)
        && (!f.desde || n.programada_para >= f.desde) && (!f.hasta || n.programada_para <= f.hasta))
        .sort((a, b) => b.programada_para.localeCompare(a.programada_para))
        .map((n) => ({ ...n, cliente: this.clienteRef(this.cliente(db, this.membresia(db, n.membresia_id).cliente_id)) }));
      return this.pagina(lista, f);
    }, 'admin');
  }

  obtenerConfiguracion(): Promise<Configuracion> {
    return this.ejecutar(({ db }) => structuredClone(db.configuracion), 'admin');
  }

  editarConfiguracion(d: ConfiguracionEditar): Promise<Configuracion> {
    return this.ejecutar(({ db }) => {
      const v = new Validador();
      if (!d || Object.keys(d).length === 0) v.falla('cuerpo', 'Envía al menos un campo.');
      v.texto('nombre_parqueadero', d?.nombre_parqueadero, 2, 80, false);
      if (d?.capacidad !== undefined && d.capacidad !== null) v.entero('capacidad', d.capacidad, 1, 10_000);
      v.entero('dias_por_vencer', d?.dias_por_vencer, 0, 30, false);
      if (d?.dias_recordatorio) {
        if (d.dias_recordatorio.length > 5) v.falla('dias_recordatorio', 'Máximo 5 días.');
        if (new Set(d.dias_recordatorio).size !== d.dias_recordatorio.length) v.falla('dias_recordatorio', 'No repitas días.');
        d.dias_recordatorio.forEach((x, i) => v.entero(`dias_recordatorio.${i}`, x, 0, 30));
      }
      for (const tipo of ['recordatorio', 'vencida'] as const) {
        const pl = d?.plantillas?.[tipo];
        if (!pl) continue;
        v.texto(`plantillas.${tipo}.asunto`, pl.asunto, 3, 120);
        v.texto(`plantillas.${tipo}.cuerpo`, pl.cuerpo, 10, 2000);
        for (const campo of ['asunto', 'cuerpo'] as const) { // RN-65
          const desconocida = [...(pl[campo] ?? '').matchAll(/\{(\w*)\}/g)].map((x) => x[1]!).find((x) => !VARIABLES_PLANTILLA.includes(x));
          if (desconocida !== undefined) v.falla(`plantillas.${tipo}.${campo}`, `Variable desconocida {${desconocida}}. Usa: ${VARIABLES_PLANTILLA.map((x) => `{${x}}`).join(', ')}.`);
        }
      }
      v.verificar();
      const c = db.configuracion;
      if (d.nombre_parqueadero !== undefined) c.nombre_parqueadero = d.nombre_parqueadero.trim();
      if (d.capacidad !== undefined) c.capacidad = d.capacidad;
      if (d.dias_por_vencer !== undefined) c.dias_por_vencer = d.dias_por_vencer;
      if (d.dias_recordatorio !== undefined) c.dias_recordatorio = [...d.dias_recordatorio].sort((a, b) => b - a);
      if (d.plantillas?.recordatorio) c.plantillas.recordatorio = d.plantillas.recordatorio;
      if (d.plantillas?.vencida) c.plantillas.vencida = d.plantillas.vencida;
      c.actualizado_en = this.reloj.ahora().toISOString();
      return structuredClone(c);
    }, 'admin');
  }
}
