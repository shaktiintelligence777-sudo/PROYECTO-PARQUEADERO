import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

export const CLASE_CONTROL =
  'w-full rounded-control border border-asfalto-300 bg-blanco px-3 text-cuerpo text-asfalto-900 placeholder:text-asfalto-500 ' +
  'disabled:bg-asfalto-100 aria-[invalid=true]:border-peligro';

export const Entrada = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Entrada({ className, ...resto }, ref) {
  return <input ref={ref} className={cx(CLASE_CONTROL, 'h-12', className)} {...resto} />;
});

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function AreaTexto({ className, rows = 3, ...resto }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(CLASE_CONTROL, 'py-2', className)} {...resto} />;
});

export const Selector = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selector({ className, children, ...resto }, ref) {
  return <select ref={ref} className={cx(CLASE_CONTROL, 'h-12', className)} {...resto}>{children}</select>;
});
