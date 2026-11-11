import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCrearCliente } from '@/api/hooks';
import { normalizarPlaca } from '@/lib/formato';
import { CabeceraPagina, useToast } from '@/ui';
import { FormularioClienteAlta } from './FormularioCliente';
import { useDescartarCambios } from './useDescartarCambios';

/** P5 · Nuevo cliente (`/clientes/nuevo`). `?placa=` rellena la primera placa. */
export function PaginaNuevoCliente() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const { mostrar } = useToast();
  const crear = useCrearCliente();
  const { setSucio, intentarSalir, dialogo } = useDescartarCambios();
  const placaInicial = normalizarPlaca(params.get('placa') ?? '').slice(0, 7);

  return (
    <div className="mx-auto max-w-hoja">
      <CabeceraPagina titulo="Nuevo cliente" alVolver={() => intentarSalir(() => navegar('/clientes'))} />
      <FormularioClienteAlta
        placaInicial={placaInicial}
        alCambiarSucio={setSucio}
        alEnviar={async (datos) => {
          const cliente = await crear.mutateAsync(datos);
          setSucio(false);
          mostrar({ tono: 'exito', mensaje: 'Cliente registrado.' });
          navegar(`/clientes/${cliente.id}?crear_membresia=1`, { replace: true });
        }}
      />
      {dialogo}
    </div>
  );
}
