import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ErrorApi, type Moto } from '@/api';
import { useCrearMoto, useEditarMoto } from '@/api/hooks';
import { Boton, Campo, Entrada, Hoja, useToast } from '@/ui';
import { EntradaPlacaForm } from './EntradaPlacaForm';
import { errorACampos } from './errores';
import { aMotoCrear, aMotoEditar, esquemaMoto, LIMITES, type ValoresMoto } from './esquemas';
import { useDescartarCambios } from './useDescartarCambios';

export interface HojaMotoProps {
  abierta: boolean;
  alCerrar: () => void;
  clienteId: string;
  /** Sin moto: crea una nueva. Con moto: la edita. */
  moto?: Moto;
  esAdmin: boolean;
}

const ID_FORM = 'form-moto';

export function HojaMoto({ abierta, alCerrar, clienteId, moto, esAdmin }: HojaMotoProps) {
  const { setSucio, intentarSalir, dialogo } = useDescartarCambios();
  const cerrar = () => intentarSalir(alCerrar);
  return (
    <>
      <Hoja abierta={abierta} alCerrar={cerrar} titulo={moto ? 'Editar moto' : 'Agregar moto'}>
        <FormularioMoto clienteId={clienteId} moto={moto} esAdmin={esAdmin} alCambiarSucio={setSucio} alTerminar={() => { setSucio(false); alCerrar(); }} alCancelar={cerrar} />
      </Hoja>
      {dialogo}
    </>
  );
}

interface FormularioMotoProps {
  clienteId: string;
  moto?: Moto;
  esAdmin: boolean;
  alCambiarSucio: (s: boolean) => void;
  alTerminar: () => void;
  alCancelar: () => void;
}

function FormularioMoto({ clienteId, moto, esAdmin, alCambiarSucio, alTerminar, alCancelar }: FormularioMotoProps) {
  const { mostrar } = useToast();
  const crear = useCrearMoto();
  const editar = useEditarMoto();
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const { register, control, handleSubmit, setError, formState: { errors, isDirty, isSubmitting } } = useForm<ValoresMoto, unknown, z.output<typeof esquemaMoto>>({
    resolver: zodResolver(esquemaMoto),
    mode: 'onTouched',
    defaultValues: { placa: moto?.placa ?? '', marca: moto?.marca ?? '', color: moto?.color ?? '' },
  });
  useEffect(() => { alCambiarSucio(isDirty); }, [isDirty, alCambiarSucio]);

  const enviar = handleSubmit(async (v) => {
    try {
      if (moto) await editar.mutateAsync({ id: moto.id, datos: aMotoEditar(v) });
      else await crear.mutateAsync(aMotoCrear(v, clienteId));
      alTerminar();
    } catch (err) {
      const toast = errorACampos<ValoresMoto>(err, setError, 'placa');
      if (toast) mostrar({ tono: 'peligro', mensaje: toast });
    }
  });

  async function cambiarActivo(activo: boolean) {
    if (!moto) return;
    setCambiandoEstado(true);
    try {
      await editar.mutateAsync({ id: moto.id, datos: { activo } });
      alTerminar();
    } catch (err) {
      mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos guardar los cambios. Inténtalo de nuevo.' });
    } finally {
      setCambiandoEstado(false);
    }
  }

  return (
    <>
      <form id={ID_FORM} onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
        <Campo etiqueta="Placa *" error={errors.placa?.message}>
          <EntradaPlacaForm control={control} name="placa" />
        </Campo>
        <Campo etiqueta="Marca" error={errors.marca?.message}><Entrada maxLength={LIMITES.marca} {...register('marca')} /></Campo>
        <Campo etiqueta="Color" error={errors.color?.message}><Entrada maxLength={LIMITES.color} {...register('color')} /></Campo>
      </form>
      {moto && esAdmin && (
        moto.activo
          ? <Boton variante="peligro" className="mt-4" cargando={cambiandoEstado} onClick={() => void cambiarActivo(false)}>Desactivar moto</Boton>
          : <Boton variante="secundario" className="mt-4" cargando={cambiandoEstado} onClick={() => void cambiarActivo(true)}>Reactivar moto</Boton>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCancelar}>Cancelar</Boton>
        <Boton type="submit" form={ID_FORM} cargando={isSubmitting}>Guardar</Boton>
      </div>
    </>
  );
}
