import { z } from 'zod';
import { formatoDinero } from '@/lib/formato';
import { finDePeriodo } from '@/lib/fechas';

export const METODOS = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;
export type MetodoPago = (typeof METODOS)[number]['valor'];

export const MIN_MOTIVO = 5;
export const MAX_NOTA = 300;

export const MENSAJES = {
  plan: 'Elige un plan.',
  fecha: 'Escribe la fecha de inicio.',
  monto: 'Escribe el monto.',
  notaCrear: 'Explica por qué el monto es distinto al del plan.',
  membresiaExistente: 'Este cliente ya tiene una membresía.',
  planInactivo: 'Ese plan ya no está disponible.',
} as const;

/** Mensaje de la nota obligatoria de un pago (RN-43): incluye el monto sugerido. */
export const mensajeNotaPago = (sugerido: number) => `Explica por qué el monto es distinto al sugerido (${formatoDinero(sugerido)}).`;

/** Fecha en que termina una membresía que empieza en `inicio`: un mes después menos un día en planes mensuales; inicio + duración − 1 en los demás (RN-31). */
export const ultimoDiaCubierto = (inicio: string, duracionDias: number) => finDePeriodo(inicio, duracionDias, 1);

export const esquemaCrearMembresia = (precioPlan: number) =>
  z.object({
    plan_id: z.string().min(1, MENSAJES.plan),
    fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, MENSAJES.fecha),
    monto: z.number({ error: MENSAJES.monto }).int(MENSAJES.monto).min(1, MENSAJES.monto),
    metodo: z.enum(['efectivo', 'transferencia', 'otro']),
    nota: z.string().trim().max(MAX_NOTA),
  }).superRefine((v, ctx) => {
    if (v.monto !== precioPlan && v.nota === '') ctx.addIssue({ code: 'custom', path: ['nota'], message: MENSAJES.notaCrear });
  });

export const esquemaCambiarPlan = z.object({ plan_id: z.string().min(1, MENSAJES.plan) });
