import { idSemilla } from './ids';
import type { Db, FilaCliente, FilaEstancia, FilaMembresia, FilaMoto, FilaNotificacion, FilaPago, FilaPlan } from './modelo';
import type { Reloj } from './reloj';
import { sumarDias } from './reglas';

// Subir este número cada vez que cambie la semilla o la forma de los datos: los navegadores con una base
// guardada de otra versión la descartan y vuelven a sembrar (si no, siguen viendo el demo viejo).
export const VERSION_DB = 2;
export const EMAIL_ADMIN = 'demo@parqueadero.app';
export const EMAIL_OPERADOR = 'operador@parqueadero.app';
export const PASSWORD_DEMO = 'demo1234';

const T = { usuario: 1, cliente: 2, moto: 3, plan: 4, membresia: 5, pago: 6, estancia: 7, notificacion: 8 };

/** Hora local de Bogotá (UTC−5) de una fecha YYYY-MM-DD → instante ISO en UTC. */
export function instanteBogota(fecha: string, hora: string): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const [h, min] = hora.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1, d, h + 5, min)).toISOString();
}

interface ClienteSemilla {
  nombre: string; email: string | null; motos: [string, string, string][];
  plan: 0; venc: number | null; cancelada?: boolean; inicioHoy?: boolean;
}

// Documentos 900000xxx y emails @example.com: datos ficticios.
const CLIENTES: ClienteSemilla[] = [
  { nombre: 'Carlos Pérez', email: 'carlos.perez@example.com', motos: [['ABC12D', 'Yamaha', 'Negro']], plan: 0, venc: 29, inicioHoy: true },
  { nombre: 'María Gómez', email: 'maria.gomez@example.com', motos: [['XYZ34E', 'Honda', 'Rojo']], plan: 0, venc: 6, inicioHoy: true },
  { nombre: 'Andrés Rojas', email: 'andres.rojas@example.com', motos: [['MNO56F', 'Suzuki', 'Azul'], ['MNP57G', 'AKT', 'Blanco']], plan: 0, venc: 18 },
  { nombre: 'Laura Díaz', email: 'laura.diaz@example.com', motos: [['QRS78G', 'Bajaj', 'Negro']], plan: 0, venc: 9 },
  { nombre: 'Juan Torres', email: 'juan.torres@example.com', motos: [['TUV90H', 'Hero', 'Gris']], plan: 0, venc: 7 },
  { nombre: 'Sofía Herrera', email: 'sofia.herrera@example.com', motos: [['GHI11J', 'Yamaha', 'Azul']], plan: 0, venc: 5 },
  { nombre: 'José Martínez', email: 'jose.martinez@example.com', motos: [['JKL22K', 'Honda', 'Negro']], plan: 0, venc: 2 },
  { nombre: 'Valentina Ruiz', email: 'valentina.ruiz@example.com', motos: [['PQR33L', 'Suzuki', 'Rojo'], ['PQR34M', 'Yamaha', 'Verde']], plan: 0, venc: 0 },
  { nombre: 'Camilo Ortiz', email: 'camilo.ortiz@example.com', motos: [['STU44N', 'AKT', 'Negro']], plan: 0, venc: -4 },
  { nombre: 'Daniela Castro', email: null, motos: [['VWX55P', 'Bajaj', 'Blanco']], plan: 0, venc: -10 },
  { nombre: 'Felipe Vargas', email: 'felipe.vargas@example.com', motos: [['YZA66Q', 'Hero', 'Azul']], plan: 0, venc: 8, cancelada: true },
  { nombre: 'Natalia Mejía', email: 'natalia.mejia@example.com', motos: [['BCD77R', 'Honda', 'Gris']], plan: 0, venc: null },
];

/** Datos iniciales; las fechas son relativas a "hoy" para que el demo siempre muestre todos los estados. */
export function crearSemilla(reloj: Reloj): Db {
  const hoy = reloj.hoy();
  const ahora = reloj.ahora();
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
  const creado = instanteBogota(sumarDias(hoy, -60), '09:00');
  const admin = idSemilla(T.usuario, 1);
  const operador = idSemilla(T.usuario, 2);

  const planes: FilaPlan[] = [
    { id: idSemilla(T.plan, 1), nombre: 'Mensual', duracion_dias: 30, precio: 85000, activo: true, creado_en: creado },
  ];

  const clientes: FilaCliente[] = [];
  const motos: FilaMoto[] = [];
  const membresias: FilaMembresia[] = [];
  const pagos: FilaPago[] = [];
  const notificaciones: FilaNotificacion[] = [];
  let nMoto = 0, nPago = 0, nNoti = 0;

  CLIENTES.forEach((c, i) => {
    const idCliente = idSemilla(T.cliente, i + 1);
    clientes.push({
      id: idCliente, nombre: c.nombre, documento: `900000${String(i + 1).padStart(3, '0')}`,
      telefono: `30012345${String(i).padStart(2, '0')}`, email: c.email,
      notas: i === 2 ? 'Prefiere el puesto cerca de la entrada.' : null, activo: true, creado_en: creado,
    });
    c.motos.forEach(([placa, marca, color]) => {
      nMoto += 1;
      motos.push({ id: idSemilla(T.moto, nMoto), cliente_id: idCliente, placa, marca, color, activo: true, creado_en: creado });
    });
    if (c.venc === null) return;

    const plan = planes[c.plan]!;
    const idMem = idSemilla(T.membresia, i + 1);
    const vencimiento = sumarDias(hoy, c.venc);
    const inicio = sumarDias(vencimiento, -(plan.duracion_dias - 1));
    const base = { id: '', membresia_id: idMem, plan_id: plan.id, periodos: 1, nota: null as string | null, registrado_por: i % 2 ? operador : admin,
      anulado: false, anulado_en: null, anulado_por: null, motivo_anulacion: null };
    membresias.push({
      id: idMem, cliente_id: idCliente, plan_id: plan.id, fecha_inicio: inicio, fecha_vencimiento: vencimiento,
      cancelada_en: c.cancelada ? hace(2 * 1440) : null, motivo_cancelacion: c.cancelada ? 'El cliente se mudó de barrio.' : null,
      creado_en: instanteBogota(inicio, '10:00'),
    });
    nPago += 1;
    pagos.push({
      ...base, id: idSemilla(T.pago, nPago), monto: plan.precio, metodo: i % 3 === 0 ? 'efectivo' : 'transferencia',
      periodo_desde: inicio, periodo_hasta: vencimiento, vencimiento_anterior: sumarDias(inicio, -1),
      creado_en: c.inicioHoy ? hace(120 + i * 15) : instanteBogota(inicio, '10:00'),
    });
    if (i === 4) { // un pago anulado (RN-47): su vencimiento volvió al valor anterior
      nPago += 1;
      pagos.push({
        ...base, id: idSemilla(T.pago, nPago), monto: plan.precio, metodo: 'efectivo',
        periodo_desde: sumarDias(vencimiento, 1), periodo_hasta: sumarDias(vencimiento, plan.duracion_dias),
        vencimiento_anterior: vencimiento, creado_en: hace(1440 + 60), anulado: true, anulado_en: hace(1440),
        anulado_por: admin, motivo_anulacion: 'Pago registrado en el cliente equivocado.',
      });
    }
    // Notificaciones coherentes con el calendario (RN-60) para clientes con email.
    if (c.email && !c.cancelada) {
      const nueva = (tipo: 'recordatorio' | 'vencida', dias: number, estado: FilaNotificacion['estado'], error: string | null = null) => {
        nNoti += 1;
        const prog = sumarDias(vencimiento, dias);
        notificaciones.push({
          id: idSemilla(T.notificacion, nNoti), membresia_id: idMem, tipo, canal: 'email', programada_para: prog, estado,
          enviada_en: estado === 'enviada' ? instanteBogota(prog, '08:00') : null,
          intentos: estado === 'pendiente' ? 0 : estado === 'fallida' ? 3 : 1, error, creado_en: instanteBogota(prog, '07:00'),
        });
      };
      if (i === 6) { nueva('recordatorio', -3, 'enviada'); nueva('recordatorio', -1, 'pendiente'); }
      if (i === 7) { nueva('recordatorio', -3, 'enviada'); nueva('recordatorio', -1, 'enviada'); nueva('recordatorio', 0, 'enviada'); }
      if (i === 8) { nueva('recordatorio', -3, 'enviada'); nueva('recordatorio', -1, 'enviada'); nueva('recordatorio', 0, 'fallida', 'El servidor de correo no respondió.'); nueva('vencida', 1, 'enviada'); }
    }
  });

  // Motos dentro ahora: una lleva más de 24 h (CB-5) y una es de un cliente con membresía vencida.
  const porPlaca = (placa: string) => motos.find((m) => m.placa === placa)!;
  const abiertas: [string, number][] = [['ABC12D', 95], ['MNO56F', 30 * 60], ['QRS78G', 240], ['JKL22K', 45], ['STU44N', 180]];
  const estancias: FilaEstancia[] = abiertas.map(([placa, min], k) => ({
    id: idSemilla(T.estancia, k + 1), moto_id: porPlaca(placa).id, entrada_en: hace(min), salida_en: null,
    operador_entrada: k % 2 ? operador : admin, operador_salida: null,
  }));
  // ~30 estancias cerradas en los últimos 7 días. (moto, día) siempre distintos: no se solapan.
  for (let i = 0; i < 30; i += 1) {
    const dia = sumarDias(hoy, -(2 + (i % 6)));
    const hora = `${String(6 + ((i * 7) % 10)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    const entrada = instanteBogota(dia, hora);
    const duracion = 120 + ((i * 37) % 480);
    estancias.push({
      id: idSemilla(T.estancia, 100 + i), moto_id: motos[i % motos.length]!.id, entrada_en: entrada,
      salida_en: new Date(new Date(entrada).getTime() + duracion * 60_000).toISOString(),
      operador_entrada: i % 2 ? operador : admin, operador_salida: i % 3 ? admin : operador,
    });
  }

  return {
    version: VERSION_DB,
    sembrado_en: ahora.toISOString(),
    usuarios: [
      { id: admin, email: EMAIL_ADMIN, nombre: 'Usuario Demo', rol: 'admin', activo: true, password: PASSWORD_DEMO, creado_en: creado },
      { id: operador, email: EMAIL_OPERADOR, nombre: 'Operador Demo', rol: 'operador', activo: true, password: PASSWORD_DEMO, creado_en: creado },
    ],
    clientes, motos, planes, membresias, pagos, estancias, notificaciones,
    configuracion: {
      nombre_parqueadero: 'Parqueadero Las Bermúdez', capacidad: 40, dias_por_vencer: 3, dias_recordatorio: [3, 1, 0],
      plantillas: {
        recordatorio: {
          asunto: 'Tu membresía vence el {fecha_vencimiento}',
          cuerpo: 'Hola {nombre}, tu plan {plan} en {parqueadero} vence el {fecha_vencimiento}. Renovarlo cuesta {precio}.',
        },
        vencida: {
          asunto: 'Tu membresía está vencida',
          cuerpo: 'Hola {nombre}, tu plan {plan} en {parqueadero} venció el {fecha_vencimiento}. Pasa por la caja para renovarlo.',
        },
      },
      actualizado_en: creado,
    },
  };
}
