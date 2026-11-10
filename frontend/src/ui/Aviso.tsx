import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { TONO_SUAVE, cx, type Tono } from './cx';

const ICONOS: Record<Tono, ReactNode> = {
  exito: <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />,
  aviso: <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />,
  peligro: <XCircle aria-hidden="true" className="size-5 shrink-0" />,
  info: <Info aria-hidden="true" className="size-5 shrink-0" />,
  neutro: <Info aria-hidden="true" className="size-5 shrink-0" />,
};

export interface AvisoProps { tono?: Tono; titulo?: string; children?: ReactNode; accion?: ReactNode; className?: string }

export function Aviso({ tono = 'info', titulo, children, accion, className }: AvisoProps) {
  return (
    <div role={tono === 'peligro' ? 'alert' : undefined} className={cx('flex items-start gap-3 rounded-tarjeta p-4', TONO_SUAVE[tono], className)}>
      {ICONOS[tono]}
      <div className="min-w-0 flex-1">
        {titulo && <p className="text-cuerpo font-semibold">{titulo}</p>}
        {children && <div className="text-apoyo">{children}</div>}
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </div>
  );
}
