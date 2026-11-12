import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { beforeEach, describe, expect, it } from 'vitest';
import { ErrorApi } from '../client';
import { MockApi } from './MockApi';
import { CLAVE_DB } from './almacen';
import { relojFijo } from './reloj';
import { sumarDias } from './reglas';
import { EMAIL_ADMIN, EMAIL_OPERADOR, PASSWORD_DEMO, VERSION_DB, crearSemilla } from './semilla';

const reloj = relojFijo('2026-11-10T17:00:00Z'); // 12:00 en Bogotá
const hoy = reloj.hoy();
let api: MockApi;

const nueva = () => new MockApi({ almacenamiento: localStorage, sesion: sessionStorage, reloj, espera: 0 });
async function entrar(email = EMAIL_ADMIN) {
  const s = await api.login({ email, password: PASSWORD_DEMO });
  api.establecerToken(s.access_token);
  return s;
}
const falla = async (p: Promise<unknown>, status: number, codigo: string) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ErrorApi);
  expect(e).toMatchObject({ status, codigo });
  return e as ErrorApi;
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  api = nueva();
  await entrar();
});

describe('A-02 · MockApi', () => {
  it('CA-1 implementa todos los operationId del contrato (menos salud y ejecutarJobNotificaciones)', () => {
    const doc = parse(readFileSync('../contracts/openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, { operationId?: string }>> };
    const ids = Object.values(doc.paths).flatMap((p) => Object.values(p).map((o) => o.operationId).filter(Boolean)) as string[];
    const esperados = ids.filter((i) => i !== 'salud' && i !== 'ejecutarJobNotificaciones');
    expect(esperados.length).toBeGreaterThan(30);
    for (const id of esperados) expect(typeof (api as unknown as Record<string, unknown>)[id], id).toBe('function');
  });

  it('CA-2 con almacenamiento vacío siembra y el login demo devuelve rol admin', async () => {
    localStorage.clear();
    const s = await nueva().login({ email: EMAIL_ADMIN, password: PASSWORD_DEMO });
    expect(s.usuario.rol).toBe('admin');
    expect(s.token_type).toBe('bearer');
    expect(s.refresh_token.length).toBeGreaterThanOrEqual(20);
    expect(JSON.stringify(s)).not.toContain(PASSWORD_DEMO);
    expect(localStorage.getItem(CLAVE_DB)).not.toBeNull();
  });

  it('CA-3 contraseña incorrecta → 401 credenciales_invalidas (mismo mensaje con email inexistente)', async () => {
    const a = await falla(api.login({ email: EMAIL_ADMIN, password: 'mala' }), 401, 'credenciales_invalidas');
    const b = await falla(api.login({ email: 'nadie@example.com', password: 'mala' }), 401, 'credenciales_invalidas');
    expect(a.mensaje).toBe(b.mensaje);
  });

  it('RN-75 el sexto intento fallido seguido da 429', async () => {
    for (let i = 0; i < 5; i += 1) await falla(api.login({ email: EMAIL_OPERADOR, password: 'x' }), 401, 'credenciales_invalidas');
    await falla(api.login({ email: EMAIL_OPERADOR, password: PASSWORD_DEMO }), 429, 'demasiados_intentos');
  });

  it('sin token → 401 no_autenticado; refresh es de un solo uso y su reutilización revoca la sesión (CB-14)', async () => {
    api.establecerToken(null);
    await falla(api.listarClientes(), 401, 'no_autenticado');
    const s = await api.login({ email: EMAIL_ADMIN, password: PASSWORD_DEMO });
    const s2 = await api.refrescarSesion({ refresh_token: s.refresh_token });
    expect(s2.refresh_token).not.toBe(s.refresh_token);
    await falla(api.refrescarSesion({ refresh_token: s.refresh_token }), 401, 'token_invalido');
    await falla(api.refrescarSesion({ refresh_token: s2.refresh_token }), 401, 'token_invalido');
    api.establecerToken(s2.access_token);
    await falla(api.usuarioActual(), 401, 'token_invalido');
  });

  it('CA-4 cada estado de membresía tiene al menos un elemento y dias_restantes es coherente', async () => {
    for (const estado of ['activa', 'por_vencer', 'vencida', 'cancelada'] as const) {
      const r = await api.listarMembresias({ estado });
      expect(r.items.length, estado).toBeGreaterThanOrEqual(1);
      for (const m of r.items) {
        expect(m.estado).toBe(estado);
        const dias = (Date.parse(m.fecha_vencimiento) - Date.parse(hoy)) / 86_400_000;
        expect(m.dias_restantes).toBe(dias);
      }
    }
  });

  it('CA-5 la entrada normaliza la placa y una segunda entrada da 409 moto_ya_dentro', async () => {
    const r = await api.registrarEntrada({ placa: 'gh-i11 j' });
    expect(r.estancia.moto.placa).toBe('GHI11J');
    expect(r.estancia.salida_en).toBeNull();
    await falla(api.registrarEntrada({ placa: 'GHI11J' }), 409, 'moto_ya_dentro');
  });

  it('CA-6 placa inexistente → 404 moto_no_registrada', async () => {
    await falla(api.consultarPlaca('ZZZ99Z'), 404, 'moto_no_registrada');
    await falla(api.registrarEntrada({ placa: 'ZZZ99Z' }), 404, 'moto_no_registrada');
  });

  it('CA-7 entrada con membresía vencida: advertencia y entrada registrada', async () => {
    const c = await api.consultarPlaca('VWX55P'); // vencida hace 10 días
    expect(c.advertencias).toEqual(['membresia_vencida']);
    const r = await api.registrarEntrada({ placa: 'VWX55P' });
    expect(r.advertencias).toEqual(['membresia_vencida']);
    expect((await api.listarMotosDentro()).items.some((e) => e.moto.placa === 'VWX55P')).toBe(true);
    const salida = await api.registrarSalida({ placa: 'VWX55P' });
    expect(salida.advertencias).toEqual([]);
    await falla(api.registrarSalida({ placa: 'VWX55P' }), 409, 'moto_no_esta_dentro');
  });

  it('CB-10 cliente con membresía cancelada y cliente sin membresía → sin_membresia', async () => {
    expect((await api.consultarPlaca('YZA66Q')).advertencias).toEqual(['sin_membresia']);
    expect((await api.consultarPlaca('BCD77R')).advertencias).toEqual(['sin_membresia']);
  });

  async function membresiaDe(placa: string) {
    const c = await api.consultarPlaca(placa);
    return c.membresia!;
  }

  it('CA-8 pago con 2 días restantes: el periodo empieza el día siguiente al vencimiento (CB-2)', async () => {
    const m = await membresiaDe('JKL22K'); // vence en 2 días, Mensual
    expect(m.dias_restantes).toBe(2);
    const previo = await api.previsualizarPago({ membresia_id: m.id });
    const r = await api.registrarPago({ membresia_id: m.id, monto: 60000, metodo: 'efectivo' });
    expect(r.pago.periodo_desde).toBe(sumarDias(m.fecha_vencimiento, 1));
    expect(r.membresia.fecha_vencimiento).toBe(sumarDias(m.fecha_vencimiento, 30));
    expect(r.pago.periodo_hasta).toBe(previo.periodo_hasta);
    expect(r.membresia.estado).toBe('activa');
  });

  it('CA-9 pago con membresía vencida empieza hoy; previsualizar no modifica nada (CB-3)', async () => {
    const m = await membresiaDe('STU44N'); // vencida hace 4 días
    const antes = JSON.stringify(await api.obtenerMembresia(m.id));
    const previo = await api.previsualizarPago({ membresia_id: m.id, periodos: 3 });
    expect(previo.periodo_desde).toBe(hoy);
    expect(previo.monto_sugerido).toBe(180000);
    expect(JSON.stringify(await api.obtenerMembresia(m.id))).toBe(antes);
    const r = await api.registrarPago({ membresia_id: m.id, monto: 180000, metodo: 'transferencia', periodos: 3 });
    expect(r.pago.periodo_desde).toBe(hoy);
    expect(r.pago.periodo_hasta).toBe(previo.periodo_hasta);
  });

  it('CA-10 monto distinto del sugerido sin nota → 422 validacion con detalles[0].campo = "nota"', async () => {
    const m = await membresiaDe('JKL22K');
    const e = await falla(api.registrarPago({ membresia_id: m.id, monto: 50000, metodo: 'efectivo' }), 422, 'validacion');
    expect(e.detalles?.[0]?.campo).toBe('nota');
    await api.registrarPago({ membresia_id: m.id, monto: 50000, metodo: 'efectivo', nota: 'Descuento acordado' });
  });

  it('CA-11 anular el último pago restaura el vencimiento; otro pago o el inicial → 409 pago_no_anulable', async () => {
    const m = await membresiaDe('JKL22K');
    const r1 = await api.registrarPago({ membresia_id: m.id, monto: 60000, metodo: 'efectivo' });
    const r2 = await api.registrarPago({ membresia_id: m.id, monto: 60000, metodo: 'efectivo' });
    await falla(api.anularPago(r1.pago.id, { motivo: 'Error de digitación' }), 409, 'pago_no_anulable');
    const a = await api.anularPago(r2.pago.id, { motivo: 'Error de digitación' });
    expect(a.pago.anulado).toBe(true);
    expect(a.membresia.fecha_vencimiento).toBe(r1.membresia.fecha_vencimiento);
    await falla(api.anularPago(r2.pago.id, { motivo: 'Otra vez' }), 409, 'pago_no_anulable');
    await api.anularPago(r1.pago.id, { motivo: 'Error de digitación' });
    const pagos = await api.listarPagosDeMembresia(m.id);
    const inicial = pagos.items.find((p) => !p.anulado)!;
    await falla(api.anularPago(inicial.id, { motivo: 'Anular inicial' }), 409, 'pago_no_anulable');
  });

  it('CA-12 crear otra membresía a un cliente con una vigente → 409 membresia_existente', async () => {
    const cli = (await api.listarClientes({ q: 'Carlos' })).items[0]!;
    const plan = (await api.listarPlanes()).items[0]!;
    await falla(api.crearMembresia({ cliente_id: cli.id, plan_id: plan.id, pago_inicial: { monto: plan.precio, metodo: 'efectivo' } }), 409, 'membresia_existente');
  });

  it('crear membresía nace con su pago (RN-31, D-9) y valida el rango de fecha_inicio', async () => {
    const cli = (await api.listarClientes({ q: 'Natalia' })).items[0]!;
    const plan = (await api.listarPlanes()).items.find((p) => p.nombre === 'Semanal')!;
    const e = await falla(api.crearMembresia({ cliente_id: cli.id, plan_id: plan.id, fecha_inicio: sumarDias(hoy, 40), pago_inicial: { monto: plan.precio, metodo: 'efectivo' } }), 422, 'validacion');
    expect(e.detalles?.[0]?.campo).toBe('fecha_inicio');
    const m = await api.crearMembresia({ cliente_id: cli.id, plan_id: plan.id, pago_inicial: { monto: plan.precio, metodo: 'efectivo' } });
    expect(m.fecha_vencimiento).toBe(sumarDias(hoy, 6));
    expect((await api.listarPagosDeMembresia(m.id)).total).toBe(1);
  });

  it('CA-13 un operador no puede ver el historial, anular pagos ni editar la configuración', async () => {
    await entrar(EMAIL_OPERADOR);
    await falla(api.listarHistorialAccesos(), 403, 'sin_permiso');
    await falla(api.anularPago('x', { motivo: 'motivo largo' }), 403, 'sin_permiso');
    await falla(api.editarConfiguracion({ capacidad: 10 }), 403, 'sin_permiso');
    await falla(api.listarUsuarios(), 403, 'sin_permiso');
    const cli = (await api.listarClientes()).items[0]!;
    await falla(api.editarCliente(cli.id, { activo: false }), 403, 'sin_permiso');
    expect((await api.editarCliente(cli.id, { notas: 'Nota del operador' })).notas).toBe('Nota del operador');
  });

  it('CA-14 los cambios persisten en una instancia nueva y reiniciarDemo() vuelve a la semilla', async () => {
    await api.crearCliente({ nombre: 'Persistente', documento: 'PERSIST1', telefono: '3001112233' });
    const otra = nueva();
    otra.establecerToken((await otra.login({ email: EMAIL_ADMIN, password: PASSWORD_DEMO })).access_token);
    expect((await otra.listarClientes({ q: 'Persistente' })).total).toBe(1);
    otra.reiniciarDemo();
    expect((await otra.listarClientes({ q: 'Persistente' })).total).toBe(0);
    expect((await otra.listarClientes()).total).toBe(12);
  });

  it('CA-15 la búsqueda ignora tildes y mayúsculas, y encuentra por prefijo de placa', async () => {
    expect((await api.listarClientes({ q: 'jose' })).items.map((c) => c.nombre)).toEqual(['José Martínez']);
    expect((await api.listarClientes({ q: 'jkl' })).items.map((c) => c.nombre)).toEqual(['José Martínez']);
    expect((await api.listarClientes({ q: 'jk-l2' })).total).toBe(1);
    expect((await api.listarClientes({ estado_membresia: 'sin_membresia' })).total).toBe(2); // cancelada + sin membresía
  });

  it('CA-16 un JSON corrupto en parqueadero.demo.v1 se vuelve a sembrar sin error', async () => {
    localStorage.setItem(CLAVE_DB, '{no es json');
    expect((await api.listarClientes()).total).toBe(12);
    localStorage.setItem(CLAVE_DB, JSON.stringify({ version: 99 }));
    expect((await api.listarClientes()).total).toBe(12);
  });

  it('CA-16 demo desactualizado: una base guardada de la versión anterior se descarta y se vuelve a sembrar', async () => {
    const vieja = { ...crearSemilla(relojFijo('2026-11-10T17:00:00Z')), version: VERSION_DB - 1 };
    vieja.configuracion.nombre_parqueadero = 'Parqueadero Demo';
    localStorage.setItem(CLAVE_DB, JSON.stringify(vieja));
    expect((await api.obtenerConfiguracion()).nombre_parqueadero).toBe('Parqueadero Las Bermúdez');
  });

  it('paginación con la forma del contrato', async () => {
    const p = await api.listarClientes({ pagina: 2, por_pagina: 5 });
    expect(p).toMatchObject({ total: 12, pagina: 2, por_pagina: 5 });
    expect(p.items).toHaveLength(5);
    await falla(api.listarClientes({ por_pagina: 500 }), 422, 'validacion');
  });

  it('clientes: validación 422, documento y placa duplicados con detalles (409), alta con motos', async () => {
    const v = await falla(api.crearCliente({ nombre: 'A', documento: '12', telefono: 'abc' }), 422, 'validacion');
    expect(v.detalles?.map((d) => d.campo).sort()).toEqual(['documento', 'nombre', 'telefono']);
    const dup = await falla(api.crearCliente({ nombre: 'Otro Cliente', documento: '900000001', telefono: '3001112233' }), 409, 'documento_duplicado');
    expect(dup.detalles?.[0]?.campo).toBe('documento');
    const placa = await falla(api.crearCliente({ nombre: 'Otro Cliente', documento: 'NUEVO123', telefono: '3001112233', motos: [{ placa: 'abc-12d' }] }), 409, 'placa_duplicada');
    expect(placa.detalles?.[0]?.campo).toBe('motos.0.placa');
    expect((await api.listarClientes({ q: 'NUEVO123' })).total).toBe(0); // no se creó nada
    const ok = await api.crearCliente({ nombre: 'Cliente Nuevo', documento: 'NUEVO123', telefono: '3001112233', motos: [{ placa: 'nue-01a', marca: 'Honda' }] });
    expect(ok.motos[0]).toMatchObject({ placa: 'NUE01A', dentro: false, activo: true });
    expect(ok.membresia).toBeNull();
  });

  it('RN-12/RN-13 no se desactiva una moto ni un cliente con una moto dentro', async () => {
    const moto = (await api.listarMotos({ placa: 'ABC12D' })).items[0]!; // dentro en la semilla
    expect(moto.dentro).toBe(true);
    await falla(api.editarMoto(moto.id, { activo: false }), 409, 'moto_dentro');
    await falla(api.editarCliente(moto.cliente_id, { activo: false }), 409, 'cliente_con_moto_dentro');
    await api.registrarSalida({ placa: 'ABC12D' });
    await api.editarCliente(moto.cliente_id, { activo: false });
    expect((await api.listarMotos({ placa: 'ABC12D' })).total).toBe(0);
    await falla(api.registrarEntrada({ placa: 'ABC12D' }), 404, 'moto_no_registrada'); // RN-14
  });

  it('cancelar membresía (RN-35) y bloquear pagos sobre una cancelada', async () => {
    const m = await membresiaDe('JKL22K');
    const c = await api.cancelarMembresia(m.id, { motivo: 'Se va del barrio' });
    expect(c.estado).toBe('cancelada');
    await falla(api.registrarPago({ membresia_id: m.id, monto: 60000, metodo: 'efectivo' }), 409, 'membresia_cancelada');
    const noti = await api.listarNotificaciones({ membresia_id: m.id, estado: 'pendiente' });
    expect(noti.total).toBe(0);
  });

  it('planes: RN-21 un plan inactivo no se puede usar en pagos y RN-22 el precio nuevo no altera pagos viejos', async () => {
    const m = await membresiaDe('JKL22K');
    const antes = (await api.listarPagosDeMembresia(m.id)).items[0]!.monto;
    const plan = (await api.listarPlanes()).items.find((p) => p.id === m.plan.id)!;
    await api.editarPlan(plan.id, { precio: 99000 });
    expect((await api.listarPagosDeMembresia(m.id)).items[0]!.monto).toBe(antes);
    await api.editarPlan(plan.id, { activo: false });
    await falla(api.previsualizarPago({ membresia_id: m.id }), 409, 'plan_inactivo');
    await falla(api.crearPlan({ nombre: 'mensual', duracion_dias: 30, precio: 1000 }), 409, 'nombre_duplicado');
  });

  it('usuarios: RN-74 último admin y auto-desactivación; RN-07 email único', async () => {
    const yo = await api.usuarioActual();
    await falla(api.editarUsuario(yo.id, { activo: false }), 409, 'auto_desactivacion');
    await falla(api.editarUsuario(yo.id, { rol: 'operador' }), 409, 'ultimo_admin');
    const dup = await falla(api.crearUsuario({ email: 'OPERADOR@parqueadero.app', nombre: 'Otro', rol: 'operador', password: 'clave1234' }), 409, 'email_duplicado');
    expect(dup.detalles?.[0]?.campo).toBe('email');
    const nuevo = await api.crearUsuario({ email: 'Nuevo@Parqueadero.app', nombre: 'Nuevo Admin', rol: 'admin', password: 'clave1234' });
    expect(nuevo.email).toBe('nuevo@parqueadero.app');
    expect(JSON.stringify(nuevo)).not.toContain('clave1234');
    await api.editarUsuario(yo.id, { rol: 'operador' }); // ya hay otro admin
  });

  it('cambiarPassword exige la actual y revoca las sesiones', async () => {
    await falla(api.cambiarPassword({ password_actual: 'mala', password_nueva: 'nuevaclave1' }), 400, 'password_incorrecta');
    await api.cambiarPassword({ password_actual: PASSWORD_DEMO, password_nueva: 'nuevaclave1' });
    await falla(api.usuarioActual(), 401, 'token_invalido');
    await api.login({ email: EMAIL_ADMIN, password: 'nuevaclave1' });
  });

  it('historial y exportación CSV con BOM (solo admin, rango obligatorio)', async () => {
    const h = await api.listarHistorialAccesos({ por_pagina: 100 });
    expect(h.total).toBe(35);
    expect(h.items[0]!.entrada_en >= h.items.at(-1)!.entrada_en).toBe(true);
    await falla(api.exportarHistorialAccesos({ desde: sumarDias(hoy, -7) } as never), 422, 'validacion');
    const blob = await api.exportarHistorialAccesos({ desde: sumarDias(hoy, -7), hasta: hoy });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
    const texto = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(texto).toContain('placa,cliente,documento,entrada,salida,duracion_minutos,operador_entrada,operador_salida');
    expect(texto.split('\n')).toHaveLength(36);
  });

  it('C-03 H-06 la exportación CSV neutraliza las fórmulas', async () => {
    const h = await api.listarHistorialAccesos({ por_pagina: 1 });
    const estancia = h.items[0]!;
    await api.editarCliente(estancia.cliente.id, { nombre: '=HYPERLINK("http://x","clic")' });
    const blob = await api.exportarHistorialAccesos({ desde: sumarDias(hoy, -7), hasta: hoy });
    const texto = new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(await blob.arrayBuffer()));
    expect(texto).toContain(`${estancia.moto.placa},"'=HYPERLINK(""http://x"",""clic"")"`);
    expect(texto).not.toMatch(/(^|,)"?=HYPERLINK/m);
  });

  it('dashboard coherente con los datos', async () => {
    const d = await api.resumenDashboard();
    expect(d.fecha).toBe(hoy);
    expect(d.motos_dentro).toBe(5);
    expect(d.capacidad).toBe(40);
    expect(d.estancias_largas).toBe(1);
    expect(d.membresias).toEqual({ activas: 6, por_vencer: 2, vencidas: 2 });
    expect(d.pagos_hoy.cantidad).toBe(2);
    expect(d.pagos_hoy.total).toBe(60000 + 18000);
    expect(d.proximos_vencimientos.length).toBeLessThanOrEqual(5);
    expect(d.proximos_vencimientos.every((m) => m.estado === 'por_vencer' || m.estado === 'vencida')).toBe(true);
  });

  it('configuración: RN-65 rechaza variables desconocidas', async () => {
    const e = await falla(api.editarConfiguracion({ plantillas: { recordatorio: { asunto: 'Hola {apodo}', cuerpo: 'Texto de prueba largo {nombre}' } } }), 422, 'validacion');
    expect(e.detalles?.[0]?.campo).toBe('plantillas.recordatorio.asunto');
    const c = await api.editarConfiguracion({ capacidad: null, dias_por_vencer: 5 });
    expect(c).toMatchObject({ capacidad: null, dias_por_vencer: 5 });
    expect((await api.listarMembresias({ estado: 'por_vencer' })).total).toBeGreaterThanOrEqual(2);
  });

  it('listarMembresias sin filtro excluye las canceladas; con estado=cancelada solo ellas', async () => {
    const todas = await api.listarMembresias({ por_pagina: 100 });
    expect(todas.items.some((m) => m.estado === 'cancelada')).toBe(false);
    const canceladas = await api.listarMembresias({ estado: 'cancelada' });
    expect(canceladas.total).toBeGreaterThan(0);
    expect(canceladas.items.every((m) => m.estado === 'cancelada')).toBe(true);
  });
});

describe('visitante diario', () => {
  beforeEach(async () => { await entrar(EMAIL_OPERADOR); });

  it('registra entrada sin cliente ni moto, sin membresía ni advertencias, y cuenta en el tablero', async () => {
    const antes = (await api.resumenDashboard()).motos_dentro;
    const r = await api.registrarEntradaCasual({ placa: 'qwe-12r', marca: 'Yamaha', color: 'Azul' });
    expect(r.membresia).toBeNull();
    expect(r.advertencias).toEqual([]);
    expect(r.estancia.moto.placa).toBe('QWE12R');
    expect(r.estancia.cliente.nombre).toBe('Visitante diario');
    expect((await api.resumenDashboard()).motos_dentro).toBe(antes + 1);
    expect((await api.listarMotosDentro({ placa: 'QWE' })).items).toHaveLength(1);
    expect((await api.listarClientes()).items.some((c) => c.nombre === 'Visitante diario')).toBe(false);
  });

  it('exige marca y color; el nombre es opcional', async () => {
    await falla(api.registrarEntradaCasual({ placa: 'QWE12R', marca: '', color: '' }), 422, 'validacion');
    const r = await api.registrarEntradaCasual({ placa: 'QWE12R', marca: 'Yamaha', color: 'Azul', nombre: ' Ana ' });
    expect(r.estancia.cliente.nombre).toBe('Ana');
  });

  it('consulta y salida por placa; la misma placa puede volver otro día', async () => {
    await api.registrarEntradaCasual({ placa: 'QWE12R', marca: 'Yamaha', color: 'Azul' });
    await falla(api.registrarEntradaCasual({ placa: 'QWE12R', marca: 'Yamaha', color: 'Azul' }), 409, 'moto_ya_dentro');
    expect((await api.consultarPlaca('QWE12R')).estancia_abierta).not.toBeNull();
    const s = await api.registrarSalida({ placa: 'QWE12R' });
    expect(s.estancia.salida_en).not.toBeNull();
    await falla(api.consultarPlaca('QWE12R'), 404, 'moto_no_registrada');
    await api.registrarEntradaCasual({ placa: 'QWE12R', marca: 'Yamaha', color: 'Azul' });
  });

  it('rechaza una placa que ya pertenece a una moto registrada', async () => {
    await falla(api.registrarEntradaCasual({ placa: 'XYZ34E', marca: 'Honda', color: 'Rojo' }), 409, 'placa_duplicada');
  });
});
