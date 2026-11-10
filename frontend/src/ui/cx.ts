import clsx, { type ClassValue } from 'clsx';

export const cx = (...entradas: ClassValue[]): string => clsx(entradas);

export type Tono = 'exito' | 'aviso' | 'peligro' | 'info' | 'neutro';

/** Clases de fondo suave + texto por tono semántico (design-system §2.1). */
export const TONO_SUAVE: Record<Tono, string> = {
  exito: 'bg-exito-suave text-exito-texto',
  aviso: 'bg-aviso-suave text-aviso-texto',
  peligro: 'bg-peligro-suave text-peligro-texto',
  info: 'bg-info-suave text-info-texto',
  neutro: 'bg-neutro-suave text-neutro-texto',
};
