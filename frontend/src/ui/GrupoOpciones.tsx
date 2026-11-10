import { useRef, type KeyboardEvent } from 'react';
import { cx } from './cx';

export interface Opcion<T extends string> { valor: T; etiqueta: string }

export interface GrupoOpcionesProps<T extends string> {
  opciones: Opcion<T>[];
  valor: T | null;
  onChange: (valor: T) => void;
  etiqueta: string;
  className?: string;
}

/** Selección única tipo segmento, implementada como radiogroup (con flechas del teclado). */
export function GrupoOpciones<T extends string>({ opciones, valor, onChange, etiqueta, className }: GrupoOpcionesProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const actual = opciones.findIndex((o) => o.valor === valor);
  const mover = (e: KeyboardEvent, i: number) => {
    const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const j = (i + paso + opciones.length) % opciones.length;
    onChange(opciones[j]!.valor);
    refs.current[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={etiqueta} className={cx('inline-flex w-full flex-wrap gap-1 rounded-control bg-asfalto-100 p-1', className)}>
      {opciones.map((o, i) => {
        const marcada = o.valor === valor;
        return (
          <button
            key={o.valor}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={marcada}
            tabIndex={marcada || (actual === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.valor)}
            onKeyDown={(e) => mover(e, i)}
            className={cx(
              'min-h-11 flex-1 rounded-control px-3 text-apoyo font-semibold transition-colors duration-150 ease-out',
              marcada ? 'bg-senal-400 text-asfalto-900 shadow-tarjeta' : 'text-asfalto-700 hover:bg-blanco',
            )}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
