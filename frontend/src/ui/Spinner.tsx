import { Loader2 } from 'lucide-react';
import { cx } from './cx';

export function Spinner({ className, etiqueta = 'Cargando' }: { className?: string; etiqueta?: string }) {
  return <Loader2 role="status" aria-label={etiqueta} className={cx('size-5 animate-spin', className)} />;
}
