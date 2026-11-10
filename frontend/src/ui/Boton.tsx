import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';
import { cx } from './cx';

export type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro' | 'exito';
export type TamanoBoton = 'md' | 'lg' | 'xl';

export interface BotonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  cargando?: boolean;
  icono?: ReactNode;
  anchoCompleto?: boolean;
}

const VARIANTES: Record<VarianteBoton, string> = {
  primario: 'bg-senal-400 text-asfalto-900 hover:bg-senal-500 active:bg-senal-500',
  secundario: 'border border-asfalto-300 bg-blanco text-asfalto-900 hover:bg-asfalto-50',
  fantasma: 'bg-transparent text-info hover:bg-info-suave',
  peligro: 'bg-peligro text-blanco hover:opacity-90',
  exito: 'bg-exito text-blanco hover:opacity-90',
};
const TAMANOS: Record<TamanoBoton, string> = { md: 'h-11 px-4 text-cuerpo', lg: 'h-14 px-6 text-cuerpo', xl: 'h-16 px-6 text-subtitulo' };

export const Boton = forwardRef<HTMLButtonElement, BotonProps>(function Boton(
  { variante = 'primario', tamano = 'md', cargando = false, icono, anchoCompleto = false, className, children, disabled, type = 'button', ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(
        'relative inline-flex min-w-11 items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150 ease-out',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANTES[variante], TAMANOS[tamano], anchoCompleto && 'w-full', className,
      )}
      {...resto}
    >
      {/* El contenido se conserva (invisible) para que el botón no cambie de ancho al cargar. */}
      <span className={cx('inline-flex items-center justify-center gap-2', cargando && 'invisible')}>
        {icono}
        {children}
      </span>
      {cargando && <span className="absolute inset-0 inline-flex items-center justify-center"><Spinner /></span>}
    </button>
  );
});
