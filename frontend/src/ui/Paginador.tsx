import { Boton } from './Boton';
import { cx } from './cx';

export interface PaginadorProps { pagina: number; paginas: number; alCambiar: (pagina: number) => void; className?: string }

export function Paginador({ pagina, paginas, alCambiar, className }: PaginadorProps) {
  return (
    <nav aria-label="Paginación" className={cx('flex items-center justify-between gap-2', className)}>
      <Boton variante="secundario" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>Anterior</Boton>
      <span className="text-apoyo text-asfalto-700" aria-live="polite">Página {pagina} de {Math.max(paginas, 1)}</span>
      <Boton variante="secundario" disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>Siguiente</Boton>
    </nav>
  );
}
