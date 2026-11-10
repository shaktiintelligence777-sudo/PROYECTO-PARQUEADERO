import { cx } from './cx';

/** Bloque gris animado con las dimensiones del contenido (se dan por className). */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-control bg-asfalto-100', className ?? 'h-5 w-full')} />;
}
