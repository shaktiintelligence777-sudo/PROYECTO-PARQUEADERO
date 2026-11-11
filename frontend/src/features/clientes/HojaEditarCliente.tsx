import { useState } from 'react';
import { ErrorApi, type ClienteDetalle } from '@/api';
import { useEditarCliente } from '@/api/hooks';
import { Boton, DialogoConfirmar, Hoja, useToast } from '@/ui';
import { FormularioClienteEdicion } from './FormularioCliente';
import { useDescartarCambios } from './useDescartarCambios';

export interface HojaEditarClienteProps {
  abierta: boolean;
  alCerrar: () => void;
  cliente: ClienteDetalle;
  esAdmin: boolean;
}

const ID_FORM = 'form-editar-cliente';

export function HojaEditarCliente({ abierta, alCerrar, cliente, esAdmin }: HojaEditarClienteProps) {
  const { mostrar } = useToast();
  const editar = useEditarCliente();
  const { setSucio, intentarSalir, dialogo } = useDescartarCambios();
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const cerrar = () => intentarSalir(alCerrar);

  async function cambiarActivo(activo: boolean) {
    try {
      await editar.mutateAsync({ id: cliente.id, datos: { activo } });
      setConfirmando(false);
      setSucio(false);
      alCerrar();
    } catch (err) {
      setConfirmando(false);
      mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos guardar los cambios. Inténtalo de nuevo.' });
    }
  }

  return (
    <>
      <Hoja
        abierta={abierta}
        alCerrar={cerrar}
        titulo="Editar cliente"
        pie={
          <>
            <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
            <Boton type="submit" form={ID_FORM} cargando={enviando}>Guardar</Boton>
          </>
        }
      >
        <FormularioClienteEdicion
          id={ID_FORM}
          valores={{ nombre: cliente.nombre, documento: cliente.documento, telefono: cliente.telefono, email: cliente.email ?? '', notas: cliente.notas ?? '' }}
          alCambiarSucio={setSucio}
          alEnviando={setEnviando}
          alEnviar={async (datos) => {
            await editar.mutateAsync({ id: cliente.id, datos });
            setSucio(false);
            alCerrar();
          }}
        />
        {esAdmin && (
          <div className="mt-6 border-t border-asfalto-200 pt-4">
            {cliente.activo
              ? <Boton variante="peligro" onClick={() => setConfirmando(true)}>Desactivar cliente</Boton>
              : <Boton variante="secundario" onClick={() => void cambiarActivo(true)}>Reactivar cliente</Boton>}
          </div>
        )}
      </Hoja>
      <DialogoConfirmar
        abierta={confirmando}
        titulo="Desactivar cliente"
        texto="El cliente y sus motos dejarán de aparecer en las búsquedas. Su historial se conserva."
        textoConfirmar="Desactivar cliente"
        varianteConfirmar="peligro"
        cargando={editar.isPending}
        alConfirmar={() => void cambiarActivo(false)}
        alCancelar={() => setConfirmando(false)}
      />
      {dialogo}
    </>
  );
}
