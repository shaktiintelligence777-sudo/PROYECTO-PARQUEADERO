import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { EntradaPlaca } from '@/ui';

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** `EntradaPlaca` conectada a react-hook-form; recibe de `Campo` el id y los atributos de accesibilidad. */
export function EntradaPlacaForm<T extends FieldValues>({ control, name, ...aria }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <EntradaPlaca ref={field.ref} value={field.value as string} onChange={field.onChange} onBlur={field.onBlur} className="h-12 text-cuerpo" {...aria} />
      )}
    />
  );
}
