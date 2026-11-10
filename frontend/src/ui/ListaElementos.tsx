import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './cx';

export function ListaElementos({ children, className, etiqueta }: { children: ReactNode; className?: string; etiqueta?: string }) {
  return <ul aria-label={etiqueta} className={cx('divide-y divide-asfalto-200 overflow-hidden rounded-tarjeta bg-blanco shadow-tarjeta', className)}>{children}</ul>;
}

export interface ElementoProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  inicio?: ReactNode;
  fin?: ReactNode;
  /** Ruta a la que navega al tocar el elemento completo. */
  para?: string;
  alClic?: () => void;
}

const FILA = 'flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left';

export function Elemento({ titulo, subtitulo, inicio, fin, para, alClic }: ElementoProps) {
  const cuerpo = (
    <>
      {inicio && <span className="shrink-0">{inicio}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-cuerpo font-semibold text-asfalto-900">{titulo}</span>
        {subtitulo && <span className="block truncate text-apoyo text-asfalto-500">{subtitulo}</span>}
      </span>
      {fin && <span className="shrink-0">{fin}</span>}
    </>
  );
  const interactivo = 'transition-colors duration-150 ease-out hover:bg-asfalto-50';
  return (
    <li>
      {para ? <Link to={para} className={cx(FILA, interactivo)}>{cuerpo}</Link>
        : alClic ? <button type="button" onClick={alClic} className={cx(FILA, interactivo)}>{cuerpo}</button>
        : <div className={FILA}>{cuerpo}</div>}
    </li>
  );
}
