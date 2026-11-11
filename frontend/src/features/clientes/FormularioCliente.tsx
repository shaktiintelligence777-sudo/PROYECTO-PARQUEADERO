import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import type { z } from 'zod';
import type { ClienteCrear, ClienteEditar } from '@/api';
import { AreaTexto, Boton, BotonIcono, Campo, Entrada, useToast } from '@/ui';
import { EntradaPlacaForm } from './EntradaPlacaForm';
import { errorACampos } from './errores';
import {
  aClienteCrear, aClienteEditar, esquemaClienteAlta, esquemaClienteEdicion, LIMITES,
  type ValoresClienteAlta, type ValoresClienteEdicion,
} from './esquemas';

type SalidaAlta = z.output<typeof esquemaClienteAlta>;
type SalidaEdicion = z.output<typeof esquemaClienteEdicion>;

interface CamposProps<T extends ValoresClienteEdicion> {
  register: UseFormRegister<T>;
  errors: FieldErrors<ValoresClienteEdicion>;
}

/** Los cinco datos del cliente, comunes al alta (P5) y a la edición (hoja de la ficha). */
function CamposCliente<T extends ValoresClienteEdicion>({ register, errors }: CamposProps<T>) {
  const r = register as unknown as UseFormRegister<ValoresClienteEdicion>;
  return (
    <>
      <Campo etiqueta="Nombre completo *" error={errors.nombre?.message}>
        <Entrada autoComplete="name" maxLength={LIMITES.nombre[1]} {...r('nombre')} />
      </Campo>
      <Campo etiqueta="Documento *" error={errors.documento?.message}>
        <Entrada autoComplete="off" maxLength={20} {...r('documento')} />
      </Campo>
      <Campo etiqueta="Teléfono *" error={errors.telefono?.message}>
        <Entrada type="tel" inputMode="tel" autoComplete="tel" maxLength={20} {...r('telefono')} />
      </Campo>
      <Campo etiqueta="Email (opcional)" ayuda="Para enviarle avisos de pago" error={errors.email?.message}>
        <Entrada type="email" autoComplete="email" maxLength={LIMITES.email} {...r('email')} />
      </Campo>
      <Campo etiqueta="Notas (opcional)" error={errors.notas?.message}>
        <AreaTexto maxLength={LIMITES.notas} {...r('notas')} />
      </Campo>
    </>
  );
}

function useAvisarCambios(sucio: boolean, alCambiarSucio?: (sucio: boolean) => void) {
  useEffect(() => { alCambiarSucio?.(sucio); }, [sucio, alCambiarSucio]);
}

// ---------------------------------------------------------------- Alta (P5)

export interface FormularioAltaProps {
  placaInicial?: string;
  alEnviar: (datos: ClienteCrear) => Promise<void>;
  alCambiarSucio?: (sucio: boolean) => void;
}

const MOTO_VACIA = { placa: '', marca: '', color: '' };

export function FormularioClienteAlta({ placaInicial = '', alEnviar, alCambiarSucio }: FormularioAltaProps) {
  const { mostrar } = useToast();
  const { register, control, handleSubmit, setError, formState: { errors, isDirty, isSubmitting } } = useForm<ValoresClienteAlta, unknown, SalidaAlta>({
    resolver: zodResolver(esquemaClienteAlta),
    mode: 'onTouched',
    defaultValues: { nombre: '', documento: '', telefono: '', email: '', notas: '', motos: [{ ...MOTO_VACIA, placa: placaInicial }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'motos' });
  useAvisarCambios(isDirty, alCambiarSucio);

  const enviar = handleSubmit(async (valores) => {
    try {
      await alEnviar(aClienteCrear(valores));
    } catch (err) {
      const toast = errorACampos<ValoresClienteAlta>(err, setError, 'motos.0.placa');
      if (toast) mostrar({ tono: 'peligro', mensaje: toast });
    }
  });

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
      <CamposCliente register={register} errors={errors} />

      <fieldset className="space-y-3">
        <legend className="mb-1 text-subtitulo text-asfalto-900">Moto</legend>
        {fields.map((f, i) => (
          <div key={f.id} className="space-y-3 rounded-tarjeta border border-asfalto-200 p-3">
            <div className="flex items-start gap-2">
              <Campo etiqueta="Placa *" error={errors.motos?.[i]?.placa?.message} className="flex-1">
                <EntradaPlacaForm control={control} name={`motos.${i}.placa`} />
              </Campo>
              <BotonIcono aria-label={`Quitar moto ${i + 1}`} onClick={() => remove(i)} className="mt-6"><Trash2 aria-hidden="true" className="size-5" /></BotonIcono>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Marca" error={errors.motos?.[i]?.marca?.message}><Entrada maxLength={LIMITES.marca} {...register(`motos.${i}.marca`)} /></Campo>
              <Campo etiqueta="Color" error={errors.motos?.[i]?.color?.message}><Entrada maxLength={LIMITES.color} {...register(`motos.${i}.color`)} /></Campo>
            </div>
          </div>
        ))}
        {fields.length < LIMITES.motos && (
          <Boton variante="fantasma" icono={<Plus aria-hidden="true" className="size-5" />} onClick={() => append({ ...MOTO_VACIA })}>
            {fields.length === 0 ? 'Agregar moto' : 'Agregar otra moto'}
          </Boton>
        )}
      </fieldset>

      <Boton type="submit" tamano="lg" anchoCompleto cargando={isSubmitting}>Guardar cliente</Boton>
    </form>
  );
}

// ---------------------------------------------------------------- Edición (hoja de la ficha)

export interface FormularioEdicionProps {
  id: string;
  valores: ValoresClienteEdicion;
  alEnviar: (datos: ClienteEditar) => Promise<void>;
  alCambiarSucio?: (sucio: boolean) => void;
  /** Referencia para el botón de enviar que vive en el pie de la hoja. */
  alEnviando?: (enviando: boolean) => void;
}

export function FormularioClienteEdicion({ id, valores, alEnviar, alCambiarSucio, alEnviando }: FormularioEdicionProps) {
  const { mostrar } = useToast();
  const { register, handleSubmit, setError, formState: { errors, isDirty, isSubmitting } } = useForm<ValoresClienteEdicion, unknown, SalidaEdicion>({
    resolver: zodResolver(esquemaClienteEdicion),
    mode: 'onTouched',
    defaultValues: valores,
  });
  useAvisarCambios(isDirty, alCambiarSucio);
  useEffect(() => { alEnviando?.(isSubmitting); }, [isSubmitting, alEnviando]);

  const enviar = handleSubmit(async (v) => {
    try {
      await alEnviar(aClienteEditar(v));
    } catch (err) {
      const toast = errorACampos<ValoresClienteEdicion>(err, setError);
      if (toast) mostrar({ tono: 'peligro', mensaje: toast });
    }
  });

  return (
    <form id={id} onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
      <CamposCliente register={register} errors={errors} />
    </form>
  );
}

export type { Control };
