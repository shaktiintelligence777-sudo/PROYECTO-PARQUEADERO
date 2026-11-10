import type { HTMLAttributes } from 'react';
import { cx } from './cx';

function TarjetaBase({ className, ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-tarjeta bg-blanco p-4 shadow-tarjeta', className)} {...resto} />;
}
function Titulo({ className, ...resto }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cx('mb-3 text-subtitulo text-asfalto-900', className)} {...resto} />;
}
function Pie({ className, ...resto }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-asfalto-200 pt-3', className)} {...resto} />;
}

export const Tarjeta = Object.assign(TarjetaBase, { Titulo, Pie });
