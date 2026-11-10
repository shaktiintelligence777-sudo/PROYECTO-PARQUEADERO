import { AlertCircle } from 'lucide-react';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import { cx } from './cx';

export interface CampoProps {
  etiqueta: string;
  ayuda?: ReactNode;
  error?: string;
  className?: string;
  /** Un único control (Entrada, Selector, AreaTexto…): Campo le inyecta id, aria-invalid y aria-describedby. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

export function Campo({ etiqueta, ayuda, error, className, children }: CampoProps) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describedby = [error ? idError : null, ayuda ? idAyuda : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-apoyo font-semibold text-asfalto-700">{etiqueta}</label>
      {cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedby })}
      {ayuda && <p id={idAyuda} className="text-apoyo text-asfalto-500">{ayuda}</p>}
      {error && (
        <p id={idError} aria-live="polite" className="flex items-center gap-1 text-apoyo text-peligro-texto">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
