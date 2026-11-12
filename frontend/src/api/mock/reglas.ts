import type { Advertencia, EstadoMembresia } from '../client';
import { finDePeriodo, mesesDelPlan, sumarDias, sumarMeses } from '@/lib/fechas';

export { sumarDias };

// Funciones puras del dominio (docs/dominio.md). Referencia para quien implemente B-06.

/** Días de `hasta` − `desde` (fechas YYYY-MM-DD). */
export function diferenciaDias(hasta: string, desde: string): number {
  const f = (s: string) => { const [a, m, d] = s.split('-').map(Number) as [number, number, number]; return Date.UTC(a, m - 1, d); };
  return Math.round((f(hasta) - f(desde)) / 86_400_000);
}

export function diasRestantes(fechaVencimiento: string, hoy: string): number {
  return diferenciaDias(fechaVencimiento, hoy);
}

/** RN-32: el día del vencimiento todavía está por_vencer. */
export function estadoMembresia(
  m: { fecha_vencimiento: string; cancelada_en: string | null }, hoy: string, diasPorVencer: number,
): EstadoMembresia {
  if (m.cancelada_en) return 'cancelada';
  const dias = diasRestantes(m.fecha_vencimiento, hoy);
  if (dias < 0) return 'vencida';
  return dias <= diasPorVencer ? 'por_vencer' : 'activa';
}

/**
 * RN-41 / RN-42 (demo): periodo cubierto por un pago. Las fechas de cobro son fijas: el periodo siempre
 * empieza el día siguiente al vencimiento anterior, aunque se pague tarde o antes de tiempo. Los planes
 * de 30, 60, 90… días avanzan por meses de calendario conservando el día de `fecha_inicio`.
 */
export function periodoDePago(
  m: { fecha_inicio: string; fecha_vencimiento: string }, duracionDias: number, periodos: number,
): { periodo_desde: string; periodo_hasta: string } {
  const desde = sumarDias(m.fecha_vencimiento, 1);
  const diaAncla = Number(m.fecha_inicio.slice(8, 10));
  return { periodo_desde: desde, periodo_hasta: finDePeriodo(desde, duracionDias, periodos, diaAncla) };
}

/** RN-31: vencimiento de una membresía nueva. */
export function vencimientoInicial(fechaInicio: string, duracionDias: number): string {
  return finDePeriodo(fechaInicio, duracionDias, 1);
}

/** Inicio del ciclo que termina en `vencimiento` (inversa de `vencimientoInicial`; la usa la semilla). */
export function inicioDeCiclo(vencimiento: string, duracionDias: number): string {
  const meses = mesesDelPlan(duracionDias);
  const siguiente = sumarDias(vencimiento, 1);
  return meses === null ? sumarDias(vencimiento, -(duracionDias - 1)) : sumarMeses(siguiente, -meses);
}

/** RN-52 (y CB-10): advertencias de una entrada. */
export function advertenciasDeEstado(estado: EstadoMembresia | null): Advertencia[] {
  if (estado === null || estado === 'cancelada') return ['sin_membresia'];
  if (estado === 'vencida') return ['membresia_vencida'];
  if (estado === 'por_vencer') return ['membresia_por_vencer'];
  return [];
}

/** RN-01. */
export function normalizarPlaca(texto: string): string {
  return texto.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}
export const PLACA_VALIDA = /^[A-Z0-9]{4,7}$/;

/** Búsqueda sin tildes ni mayúsculas. */
export function plano(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}
