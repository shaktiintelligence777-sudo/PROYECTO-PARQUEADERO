import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx, type Tono } from './cx';

const BORDE: Record<Tono, string> = {
  exito: 'border-l-exito', aviso: 'border-l-aviso', peligro: 'border-l-peligro', info: 'border-l-info', neutro: 'border-l-neutro',
};

export interface IndicadorProps { etiqueta: string; valor: ReactNode; detalle?: ReactNode; tono?: Tono; enlace?: string; className?: string }

/** Tarjeta de cifra para el dashboard; con `enlace`, toda la tarjeta es clicable. */
export function Indicador({ etiqueta, valor, detalle, tono, enlace, className }: IndicadorProps) {
  const clases = cx(
    'block rounded-tarjeta bg-blanco p-4 shadow-tarjeta', tono && cx('border-l-4', BORDE[tono]),
    enlace && 'transition-shadow duration-150 ease-out hover:shadow-flotante', className,
  );
  const contenido = (
    <>
      <span className="block text-apoyo text-asfalto-500">{etiqueta}</span>
      <span className="block text-display tabular-nums text-asfalto-900">{valor}</span>
      {detalle && <span className="block text-apoyo text-asfalto-500">{detalle}</span>}
    </>
  );
  return enlace ? <Link to={enlace} className={clases}>{contenido}</Link> : <div className={clases}>{contenido}</div>;
}
