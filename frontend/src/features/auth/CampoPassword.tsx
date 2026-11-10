import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState } from 'react';
import { BotonIcono, Entrada } from '@/ui';

export interface CampoPasswordProps {
  etiqueta: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  autoComplete: 'current-password' | 'new-password';
}

/** Campo de contraseña con botón "Mostrar contraseña" / "Ocultar contraseña". */
export const CampoPassword = forwardRef<HTMLInputElement, CampoPasswordProps>(function CampoPassword({ etiqueta, value, onChange, error, autoComplete }, ref) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-apoyo font-semibold text-asfalto-700">{etiqueta}</label>
      <div className="relative">
        <Entrada
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="pr-12"
        />
        <BotonIcono aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible((v) => !v)} className="absolute right-0 top-1/2 -translate-y-1/2">
          {visible ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </BotonIcono>
      </div>
      {error && (
        <p id={`${id}-error`} aria-live="polite" className="flex items-center gap-1 text-apoyo text-peligro-texto">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
});
