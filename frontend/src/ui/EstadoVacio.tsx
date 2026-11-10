import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './cx';

export function EstadoVacio({ icono, titulo, texto, accion, className }: { icono?: ReactNode; titulo: string; texto?: string; accion?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center gap-2 rounded-tarjeta bg-blanco p-8 text-center shadow-tarjeta', className)}>
      <span className="text-asfalto-500">{icono ?? <Inbox aria-hidden="true" className="size-10" />}</span>
      <p className="text-subtitulo text-asfalto-900">{titulo}</p>
      {texto && <p className="text-apoyo text-asfalto-500">{texto}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
