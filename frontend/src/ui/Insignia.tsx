import type { ReactNode } from 'react';
import { TONO_SUAVE, cx, type Tono } from './cx';

export function Insignia({ tono = 'neutro', icono, children, className }: { tono?: Tono; icono?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-micro uppercase', TONO_SUAVE[tono], className)}>
      {icono}
      {children}
    </span>
  );
}
