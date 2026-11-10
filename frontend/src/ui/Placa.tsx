import { cx } from './cx';

export type TamanoPlaca = 'sm' | 'md' | 'lg';
const TAMANOS: Record<TamanoPlaca, string> = { sm: 'px-2 text-apoyo', md: 'px-3 text-subtitulo', lg: 'px-4 py-1 text-display' };

/** Único componente que pinta una placa: amarilla con letras negras, como una placa colombiana. */
export function Placa({ placa, tamano = 'md', className }: { placa: string; tamano?: TamanoPlaca; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`Placa ${placa}`}
      style={{ letterSpacing: '0.08em' }}
      className={cx('inline-block rounded-md border-2 border-asfalto-900 bg-senal-400 font-mono font-bold text-asfalto-900', TAMANOS[tamano], className)}
    >
      <span aria-hidden="true">{placa}</span>
    </span>
  );
}
