import { forwardRef, type InputHTMLAttributes } from 'react';
import { CLASE_CONTROL } from './Entrada';
import { cx } from './cx';

export interface EntradaDineroProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null;
  /** Recibe un entero (pesos) o null si el campo queda vacío. */
  onChange: (valor: number | null) => void;
}

const mostrar = (n: number | null) => (n === null ? '' : `$ ${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`);

export const EntradaDinero = forwardRef<HTMLInputElement, EntradaDineroProps>(function EntradaDinero({ value, onChange, className, ...resto }, ref) {
  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={mostrar(value)}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, '').slice(0, 9);
        onChange(digitos ? Number(digitos) : null);
      }}
      className={cx(CLASE_CONTROL, 'h-12 tabular-nums', className)}
      {...resto}
    />
  );
});
