import type { Configuracion, MetodoPago, Rol } from '../client';

// Filas tal como se guardan en localStorage. El estado de la membresía NO se guarda (D-8).
export interface FilaUsuario { id: string; email: string; nombre: string; rol: Rol; activo: boolean; password: string; creado_en: string }
export interface FilaCliente { id: string; nombre: string; documento: string; telefono: string; email: string | null; notas: string | null; activo: boolean; creado_en: string }
export interface FilaMoto { id: string; cliente_id: string; placa: string; marca: string | null; color: string | null; activo: boolean; creado_en: string }
export interface FilaPlan { id: string; nombre: string; duracion_dias: number; precio: number; activo: boolean; creado_en: string }
export interface FilaMembresia {
  id: string; cliente_id: string; plan_id: string; fecha_inicio: string; fecha_vencimiento: string;
  cancelada_en: string | null; motivo_cancelacion: string | null; creado_en: string;
}
export interface FilaPago {
  id: string; membresia_id: string; plan_id: string; monto: number; metodo: MetodoPago; periodos: number;
  periodo_desde: string; periodo_hasta: string; nota: string | null; registrado_por: string; creado_en: string;
  vencimiento_anterior: string; anulado: boolean; anulado_en: string | null; anulado_por: string | null; motivo_anulacion: string | null;
}
/** Datos de un visitante casual (cliente por día, sin membresía ni moto registrada). */
export interface FilaVisitante { placa: string; marca: string; color: string; nombre: string | null }
export interface FilaEstancia {
  id: string; moto_id: string; entrada_en: string; salida_en: string | null; operador_entrada: string; operador_salida: string | null;
  /** Solo en estancias de visitantes casuales; en ellas `moto_id` queda vacío. */
  visitante?: FilaVisitante;
}
export interface FilaNotificacion {
  id: string; membresia_id: string; tipo: 'recordatorio' | 'vencida'; canal: 'email' | 'whatsapp'; programada_para: string;
  estado: 'pendiente' | 'enviada' | 'fallida' | 'cancelada'; enviada_en: string | null; intentos: number; error: string | null; creado_en: string;
}

export interface Db {
  version: number;
  sembrado_en: string;
  usuarios: FilaUsuario[];
  clientes: FilaCliente[];
  motos: FilaMoto[];
  planes: FilaPlan[];
  membresias: FilaMembresia[];
  pagos: FilaPago[];
  estancias: FilaEstancia[];
  notificaciones: FilaNotificacion[];
  configuracion: Configuracion;
}
