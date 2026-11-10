import { forwardRef, type InputHTMLAttributes } from 'react';
import { normalizarPlaca } from '@/lib/formato';
import { CLASE_CONTROL } from './Entrada';
import { cx } from './cx';

export interface EntradaPlacaProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  /** Recibe la placa ya normalizada (mayúsculas, sin espacios ni guiones, máximo 7). */
  onChange: (valor: string) => void;
}

export const EntradaPlaca = forwardRef<HTMLInputElement, EntradaPlacaProps>(function EntradaPlaca({ value, onChange, className, ...resto }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="text"
      autoCapitalize="characters"
      autoComplete="off"
      spellCheck={false}
      maxLength={7}
      value={value}
      onChange={(e) => onChange(normalizarPlaca(e.target.value).slice(0, 7))}
      className={cx(CLASE_CONTROL, 'h-16 text-center font-mono text-display uppercase', className)}
      {...resto}
    />
  );
});
