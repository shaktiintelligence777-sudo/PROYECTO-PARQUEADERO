import type { Cliente, Estancia, Membresia, Moto, Pago, Plan, Usuario } from '../types';

export interface Db {
  version: number;
  usuarios: (Usuario & { password: string })[];
  clientes: Cliente[];
  motos: Moto[];
  planes: Plan[];
  membresias: Membresia[];
  pagos: Pago[];
  estancias: Estancia[];
}

export const DB_VERSION = 1;
export const DEMO_EMAIL = 'demo@parqueadero.app';
export const DEMO_PASSWORD = 'demo1234';

const DAY = 86_400_000;
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const offset = (now: Date, days: number) => isoDate(new Date(now.getTime() + days * DAY));

/** Datos ficticios; las fechas son relativas a "hoy" para que el demo siempre tenga casos. */
export function seed(now = new Date()): Db {
  const nombres = ['Carlos Pérez', 'María Gómez', 'Andrés Rojas', 'Laura Díaz', 'Juan Torres', 'Sofía Herrera'];
  const clientes: Cliente[] = nombres.map((nombre, i) => ({
    id: `cli-${i + 1}`, nombre, documento: `10${i}0000${i}${i}`,
    telefono: `3001234${i}0${i}`, email: `cliente${i + 1}@ejemplo.com`,
  }));
  const placas = ['ABC12D', 'XYZ34E', 'MNO56F', 'QRS78G', 'TUV90H', 'GHI11J'];
  const marcas = ['Yamaha', 'Honda', 'Suzuki', 'AKT', 'Bajaj', 'Hero'];
  const motos: Moto[] = placas.map((placa, i) => ({
    id: `mot-${i + 1}`, cliente_id: `cli-${i + 1}`, placa, marca: marcas[i], color: ['Negro', 'Rojo', 'Azul'][i % 3],
  }));
  const planes: Plan[] = [
    { id: 'pln-1', nombre: 'Quincenal', duracion_dias: 15, precio: 60000, activo: true },
    { id: 'pln-2', nombre: 'Mensual', duracion_dias: 30, precio: 110000, activo: true },
    { id: 'pln-3', nombre: 'Trimestral', duracion_dias: 90, precio: 300000, activo: true },
  ];
  const vencs = [20, 2, -5, 12, 0, 25];
  const membresias: Membresia[] = vencs.map((v, i) => ({
    id: `mem-${i + 1}`, cliente_id: `cli-${i + 1}`, plan_id: planes[i % 2 === 0 ? 1 : 0].id,
    fecha_inicio: offset(now, v - 30), fecha_vencimiento: offset(now, v), estado: 'activa',
  }));
  const pagos: Pago[] = membresias.map((m, i) => ({
    id: `pag-${i + 1}`, membresia_id: m.id, monto: i % 2 === 0 ? 110000 : 60000,
    metodo: i % 3 === 0 ? 'efectivo' : 'transferencia', periodo_desde: m.fecha_inicio,
    periodo_hasta: m.fecha_vencimiento, registrado_por: 'usr-1', creado_en: new Date(now.getTime() - (i + 1) * DAY).toISOString(),
  }));
  const estancias: Estancia[] = [
    { id: 'est-1', moto_id: 'mot-1', entrada_en: new Date(now.getTime() - 3 * 3600_000).toISOString(), salida_en: null, operador_entrada: 'usr-1', operador_salida: null },
    { id: 'est-2', moto_id: 'mot-2', entrada_en: new Date(now.getTime() - 26 * 3600_000).toISOString(), salida_en: new Date(now.getTime() - 20 * 3600_000).toISOString(), operador_entrada: 'usr-1', operador_salida: 'usr-1' },
  ];
  return {
    version: DB_VERSION,
    usuarios: [{ id: 'usr-1', email: DEMO_EMAIL, password: DEMO_PASSWORD, nombre: 'Operador Demo', rol: 'admin', activo: true }],
    clientes, motos, planes, membresias, pagos, estancias,
  };
}
