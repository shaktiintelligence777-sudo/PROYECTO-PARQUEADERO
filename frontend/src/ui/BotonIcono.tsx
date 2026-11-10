import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from './cx';

export interface BotonIconoProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  'aria-label': string;
  children: ReactNode;
}

export const BotonIcono = forwardRef<HTMLButtonElement, BotonIconoProps>(function BotonIcono({ className, children, type = 'button', ...resto }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('inline-flex size-11 items-center justify-center rounded-control text-asfalto-700 transition-colors duration-150 ease-out hover:bg-asfalto-100 disabled:opacity-50', className)}
      {...resto}
    >
      {children}
    </button>
  );
});
