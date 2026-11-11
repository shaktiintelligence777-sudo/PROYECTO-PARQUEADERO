// Únicas funciones permitidas para formatear (docs/ui/design-system.md §4). Zona: America/Bogota, es-CO.
const ZONA = 'America/Bogota';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function formatoDinero(valor: number): string {
  const entero = Math.round(Math.abs(valor)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${valor < 0 ? '-' : ''}$${entero}`;
}

/** "2026-11-13" → "13 nov 2026" (aritmética sobre la cadena, sin Date). */
export function formatoFecha(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number);
  return `${dia} ${MESES[(mes ?? 1) - 1]} ${anio}`;
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** "2026-11-10" → "lun 10 nov" (para el saludo del dashboard). */
export function formatoFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number) as [number, number, number];
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${DIAS_SEMANA[diaSemana]} ${dia} ${MESES[mes - 1]}`;
}

function partes(iso: string) {
  const f = new Intl.DateTimeFormat('es-CO', {
    timeZone: ZONA, day: 'numeric', month: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const periodo = (p.dayPeriod ?? '').toLowerCase().replace(/[\s\u202f\u00a0.]/g, '');
  return { dia: Number(p.day), mes: Number(p.month), hora: p.hour ?? '', minuto: p.minute ?? '', meridiano: periodo.startsWith('p') ? 'p. m.' : 'a. m.' };
}

export function formatoHora(iso: string): string {
  const p = partes(iso);
  return `${p.hora}:${p.minuto} ${p.meridiano}`;
}

export function formatoFechaHora(iso: string): string {
  const p = partes(iso);
  return `${p.dia} ${MESES[p.mes - 1]}, ${formatoHora(iso)}`;
}

export function formatoDuracion(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  if (total >= 1440) {
    const d = Math.floor(total / 1440);
    const h = Math.floor((total % 1440) / 60);
    return h ? `${d} d ${h} h` : `${d} d`;
  }
  if (total >= 60) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${total} min`;
}

export function formatoDiasRestantes(dias: number): string {
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias > 1) return `vence en ${dias} días`;
  if (dias === -1) return 'venció ayer';
  return `venció hace ${-dias} días`;
}

export function normalizarPlaca(texto: string): string {
  return texto.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}
