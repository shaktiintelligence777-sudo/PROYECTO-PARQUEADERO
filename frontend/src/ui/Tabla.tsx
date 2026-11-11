import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cx } from './cx';

export interface Columna<T> {
  clave: string;
  encabezado: string;
  celda: (fila: T) => ReactNode;
  alinear?: 'izquierda' | 'derecha';
  /** Valor por el que se ordena la columna. Si se omite, la columna no es ordenable. `null` = vacío (va siempre al final). */
  ordenar?: (fila: T) => string | number | null | undefined;
}

export interface TablaProps<T> {
  columnas: Columna<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  alClicFila?: (fila: T) => void;
  descripcion: string;
  className?: string;
}

type Direccion = 'ascendente' | 'descendente';

const comparadorTexto = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function comparar(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : comparadorTexto.compare(String(a), String(b));
}

/** Tabla para `md` en adelante (cabecera fija, filas de 52 px). En móvil las pantallas usan ListaElementos. */
export function Tabla<T>({ columnas, filas, claveFila, alClicFila, descripcion, className }: TablaProps<T>) {
  const [orden, setOrden] = useState<{ clave: string; direccion: Direccion } | null>(null);

  const ordenadas = (() => {
    const columna = columnas.find((c) => c.clave === orden?.clave);
    if (!orden || !columna?.ordenar) return filas;
    const valor = columna.ordenar;
    const signo = orden.direccion === 'ascendente' ? 1 : -1;
    return [...filas].sort((x, y) => {
      const vx = valor(x);
      const vy = valor(y);
      // Los vacíos van al final en ambas direcciones.
      if (vx == null || vx === '') return vy == null || vy === '' ? 0 : 1;
      if (vy == null || vy === '') return -1;
      return signo * comparar(vx, vy);
    });
  })();

  const alternarOrden = (clave: string) => {
    setOrden((previo) => {
      if (previo?.clave !== clave) return { clave, direccion: 'ascendente' };
      return { clave, direccion: previo.direccion === 'ascendente' ? 'descendente' : 'ascendente' };
    });
  };

  return (
    <div className={cx('max-h-[70vh] overflow-auto rounded-tarjeta bg-blanco shadow-tarjeta', className)}>
      <table className="w-full border-collapse text-left text-apoyo">
        <caption className="sr-only">{descripcion}</caption>
        <thead className="sticky top-0 bg-asfalto-100 text-asfalto-700">
          <tr>
            {columnas.map((c) => {
              const activa = orden?.clave === c.clave ? orden.direccion : null;
              const Icono = activa === null ? ArrowUpDown : activa === 'ascendente' ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.clave}
                  scope="col"
                  aria-sort={c.ordenar ? (activa === null ? 'none' : activa === 'ascendente' ? 'ascending' : 'descending') : undefined}
                  className={cx('px-4 py-3 font-semibold', c.alinear === 'derecha' && 'text-right')}
                >
                  {c.ordenar ? (
                    <button
                      type="button"
                      onClick={() => alternarOrden(c.clave)}
                      aria-label={`Ordenar por ${c.encabezado}`}
                      className={cx(
                        'inline-flex items-center gap-1 rounded-control font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-info',
                        c.alinear === 'derecha' && 'flex-row-reverse',
                      )}
                    >
                      {c.encabezado}
                      <Icono aria-hidden="true" className={cx('size-4', activa === null && 'opacity-50')} />
                    </button>
                  ) : (
                    c.encabezado
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((f) => (
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
