import { z } from 'zod';
import { MAX_NOTA, mensajeNotaPago, MENSAJES as MENSAJES_MEMBRESIA } from '@/features/membresias/esquemas';

export const PERIODOS_MIN = 1;
export const PERIODOS_MAX = 12;

/** Valida un pago contra el monto sugerido de la vista previa (RN-40 y RN-43). */
export const esquemaPago = (sugerido: number) =>
  z.object({
    periodos: z.number().int().min(PERIODOS_MIN).max(PERIODOS_MAX),
    monto: z.number({ error: MENSAJES_MEMBRESIA.monto }).int(MENSAJES_MEMBRESIA.monto).min(1, MENSAJES_MEMBRESIA.monto),
    metodo: z.enum(['efectivo', 'transferencia', 'otro']),
    nota: z.string().trim().max(MAX_NOTA),
  }).superRefine((v, ctx) => {
    if (v.monto !== sugerido && v.nota === '') ctx.addIssue({ code: 'custom', path: ['nota'], message: mensajeNotaPago(sugerido) });
  });

/** Los dos motivos de anulación o cancelación exigen 5 caracteres o más. */
export { MIN_MOTIVO } from '@/features/membresias/esquemas';
