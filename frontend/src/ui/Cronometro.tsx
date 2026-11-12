import { useAhoraCompartido } from '@/lib/ahora';
import { formatoCronometro } from '@/lib/formato';
import { cx } from './cx';

/** Tiempo transcurrido desde `desde` (instante ISO) como "HH:MM:SS", que avanza cada segundo. No se anuncia a lectores de pantalla. */
export function Cronometro({ desde, className }: { desde: string; className?: string }) {
  const ahora = useAhoraCompartido();
  return <span className={cx('tabular-nums', className)}>{formatoCronometro(desde, ahora)}</span>;
}
