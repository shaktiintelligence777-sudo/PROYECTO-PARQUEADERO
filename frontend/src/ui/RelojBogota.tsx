import { useEffect, useState } from 'react';
import { formatoRelojBogota } from '@/lib/formato';
import { cx } from './cx';

/** Reloj digital grande con la hora de Bogotá (America/Bogota), con segundos y formato de 12 horas. */
export function RelojBogota({ className }: { className?: string }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const { hora, meridiano } = formatoRelojBogota(ahora);
  return (
    <p className={cx('flex items-baseline gap-2 whitespace-nowrap text-blanco', className)}>
      <span className="text-display tabular-nums">{hora}</span>
      <span className="text-apoyo">{meridiano}</span>
    </p>
  );
}
