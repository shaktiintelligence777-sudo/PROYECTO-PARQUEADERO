import type { ReactNode } from 'react';
import { cx } from './cx';

export interface Columna<T> {
  clave: string;
  encabezado: string;
  celda: (fila: T) => ReactNode;
  alinear?: 'izquierda' | 'derecha';
}

export interface TablaProps<T> {
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  alClicFila?: (fila: T) => void;
  descripcion: string;
  className?: string;
}

/** Tabla para `md` en adelante (cabecera fija, filas de 52 px). En móvil las pantallas usan ListaElementos. */
export function Tabla<T>({ columnas, filas, claveFila, alClicFila, descripcion, className }: TablaProps<T>) {
  return (
    <div className={cx('max-h-[70vh] overflow-auto rounded-tarjeta bg-blanco shadow-tarjeta', className)}>
      <table className="w-full border-collapse text-left text-apoyo">
        <caption className="sr-only">{descripcion}</caption>
        <thead className="sticky top-0 bg-asfalto-100 text-asfalto-700">
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} scope="col" className={cx('px-4 py-3 font-semibold', c.alinear === 'derecha' && 'text-right')}>{c.encabezado}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={claveFila(f)}
              onClick={alClicFila ? () => alClicFila(f) : undefined}
              className={cx('h-13 border-t border-asfalto-200 even:bg-asfalto-50', alClicFila && 'cursor-pointer hover:bg-senal-100')}
            >
              {columnas.map((c) => (
                <td key={c.clave} className={cx('px-4 tabular-nums', c.alinear === 'derecha' && 'text-right')}>{c.celda(f)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
