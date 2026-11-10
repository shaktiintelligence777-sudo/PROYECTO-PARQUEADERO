/** "Hoy" y "ahora" salen solo de aquí, para poder fijarlos en pruebas. */
export interface Reloj { ahora(): Date; hoy(): string }

const ZONA = 'America/Bogota';

export function fechaBogota(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

export const relojReal: Reloj = {
  ahora: () => new Date(),
  hoy: () => fechaBogota(new Date()),
};

/** Reloj fijo para pruebas. Bogotá es UTC−5 sin horario de verano. */
export function relojFijo(instanteIso: string): Reloj & { avanzar(minutos: number): void } {
  let t = new Date(instanteIso).getTime();
  return {
    ahora: () => new Date(t),
    hoy: () => fechaBogota(new Date(t)),
    avanzar: (min) => { t += min * 60_000; },
  };
}
