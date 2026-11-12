const ZONA = 'America/Bogota';

/** Hoy en Bogotá (AAAA-MM-DD). Las pantallas solo lo usan para valores por defecto y rangos de filtro. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Suma (o resta) días a una fecha AAAA-MM-DD, sin depender de la zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Días de un mes (`mes` de 1 a 12). */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Suma meses de calendario a una fecha AAAA-MM-DD conservando el día `diaAncla` (por defecto el de `fecha`).
 * En meses cortos queda el último día del mes (31 ene + 1 mes = 28 feb), sin arrastrar el recorte al mes siguiente.
 */
export function sumarMeses(fecha: string, meses: number, diaAncla?: number): string {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const indice = a * 12 + (m - 1) + meses;
  const anio = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  const dia = Math.min(diaAncla ?? d, diasDelMes(anio, mes));
  return `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Un plan cuya duración es múltiplo de 30 días se cobra por meses de calendario (30 → 1 mes, 90 → 3 meses). */
export function mesesDelPlan(duracionDias: number): number | null {
  return duracionDias % 30 === 0 ? duracionDias / 30 : null;
}

/** Último día cubierto por `periodos` periodos de un plan que empiezan en `desde` (el ciclo conserva el día `diaAncla`). */
export function finDePeriodo(desde: string, duracionDias: number, periodos: number, diaAncla?: number): string {
  const meses = mesesDelPlan(duracionDias);
  return meses === null
    ? sumarDias(desde, duracionDias * periodos - 1)
    : sumarDias(sumarMeses(desde, meses * periodos, diaAncla), -1);
}
