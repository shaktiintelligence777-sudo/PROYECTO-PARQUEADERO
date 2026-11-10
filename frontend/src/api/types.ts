// Tipos de dominio (ROADMAP §2.4). Se alinearán con contracts/openapi.yaml cuando exista.
export type Rol = 'admin' | 'operador';
export type EstadoMembresia = 'activa' | 'por_vencer' | 'vencida' | 'cancelada';
export type MetodoPago = 'efectivo' | 'transferencia' | 'otro';

export interface Usuario { id: string; email: string; nombre: string; rol: Rol; activo: boolean }
export interface Cliente { id: string; nombre: string; documento: string; telefono: string; email: string }
export interface Moto { id: string; cliente_id: string; placa: string; marca: string; color: string }
export interface Plan { id: string; nombre: string; duracion_dias: number; precio: number; activo: boolean }
export interface Membresia {
  id: string; cliente_id: string; plan_id: string;
  fecha_inicio: string; fecha_vencimiento: string; estado: EstadoMembresia;
}
export interface Pago {
  id: string; membresia_id: string; monto: number; metodo: MetodoPago;
  periodo_desde: string; periodo_hasta: string; registrado_por: string; creado_en: string;
}
export interface Estancia {
  id: string; moto_id: string; entrada_en: string; salida_en: string | null;
  operador_entrada: string; operador_salida: string | null;
}
export interface Resumen { motos_dentro: number; membresias_por_vencer: number; pagos_hoy: number; total_hoy: number }

export type NuevoCliente = Omit<Cliente, 'id'>;
export type NuevaMoto = Omit<Moto, 'id'>;
export interface NuevoPago { membresia_id: string; monto: number; metodo: MetodoPago }
export interface NuevaMembresia { cliente_id: string; plan_id: string; fecha_inicio: string }
