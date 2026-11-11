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
