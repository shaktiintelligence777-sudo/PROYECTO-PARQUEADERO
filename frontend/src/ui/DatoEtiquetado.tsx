import type { ReactNode } from 'react';
import { cx } from './cx';

/** Par etiqueta / valor para fichas. */
export function DatoEtiquetado({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <dl className={cx('flex flex-col', className)}>
      <dt className="text-apoyo text-asfalto-500">{etiqueta}</dt>
      <dd className="text-cuerpo text-asfalto-900">{children}</dd>
    </dl>
  );
}
