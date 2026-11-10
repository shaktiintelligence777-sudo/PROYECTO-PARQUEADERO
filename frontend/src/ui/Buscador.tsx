import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BotonIcono } from './BotonIcono';
import { Entrada } from './Entrada';
import { cx } from './cx';

export interface BuscadorProps {
  alBuscar: (texto: string) => void;
  valorInicial?: string;
  placeholder?: string;
  etiqueta?: string;
  esperaMs?: number;
  className?: string;
}

/** Entrada con lupa y botón para limpiar; avisa del cambio 300 ms después de la última tecla. */
export function Buscador({ alBuscar, valorInicial = '', placeholder = 'Buscar', etiqueta = 'Buscar', esperaMs = 300, className }: BuscadorProps) {
  const [texto, setTexto] = useState(valorInicial);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alBuscarRef = useRef(alBuscar);
  alBuscarRef.current = alBuscar;

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  const cambiar = (nuevo: string) => {
    setTexto(nuevo);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => alBuscarRef.current(nuevo), esperaMs);
  };
  const limpiar = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setTexto('');
    alBuscarRef.current('');
  };

  return (
    <div className={cx('relative', className)} role="search">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-asfalto-500" />
      <Entrada type="search" aria-label={etiqueta} placeholder={placeholder} value={texto} onChange={(e) => cambiar(e.target.value)} className="pl-10 pr-12 [&::-webkit-search-cancel-button]:hidden" />
      {texto && (
        <BotonIcono aria-label="Limpiar búsqueda" onClick={limpiar} className="absolute right-0 top-1/2 -translate-y-1/2"><X aria-hidden="true" className="size-5" /></BotonIcono>
      )}
    </div>
  );
}
