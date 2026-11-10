import type { Advertencia, EstadoMembresia } from '../client';

// Funciones puras del dominio (docs/dominio.md). Referencia para quien implemente B-06.

/** Suma días a una fecha YYYY-MM-DD con aritmética de calendario (sin depender de la zona de la máquina). */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

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

/** RN-41 / RN-42: periodo cubierto por un pago. */
export function periodoDePago(
  fechaVencimiento: string, hoy: string, duracionDias: number, periodos: number,
): { periodo_desde: string; periodo_hasta: string } {
  const desde = hoy <= fechaVencimiento ? sumarDias(fechaVencimiento, 1) : hoy;
  return { periodo_desde: desde, periodo_hasta: sumarDias(desde, duracionDias * periodos - 1) };
}

/** RN-31: vencimiento de una membresía nueva. */
export function vencimientoInicial(fechaInicio: string, duracionDias: number): string {
  return sumarDias(fechaInicio, duracionDias - 1);
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
