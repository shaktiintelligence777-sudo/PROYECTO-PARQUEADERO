import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorApi } from '@/api';
import { useCancelarMembresia, useCliente } from '@/api/hooks';
import { useSesion } from '@/features/auth/ProveedorSesion';
import { formatoDinero, formatoFecha } from '@/lib/formato';
import { Boton, DialogoConfirmar, Esqueleto, InsigniaEstado, Tarjeta, useToast } from '@/ui';
import { HojaCambiarPlan } from './HojaCambiarPlan';
import { HojaCrearMembresia } from './HojaCrearMembresia';

/** Tarjeta de membresía de la ficha del cliente (P4). Se abre sola la hoja “Crear membresía” con `?crear_membresia=1`. */
export function SeccionMembresia({ clienteId }: { clienteId: string }) {
  const { data: cliente } = useCliente(clienteId);
  const esAdmin = useSesion().usuario?.rol === 'admin';
  const { mostrar } = useToast();
  const cancelar = useCancelarMembresia();
  const [params, setParams] = useSearchParams();
  const [creando, setCreando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const abrirCrear = creando || params.get('crear_membresia') === '1';

  const cerrarCrear = () => {
    setCreando(false);
    if (params.has('crear_membresia')) {
      const nuevo = new URLSearchParams(params);
      nuevo.delete('crear_membresia');
      setParams(nuevo, { replace: true });
    }
  };

  async function confirmarCancelacion(motivo?: string) {
    const m = cliente?.membresia;
    if (!m || !motivo) return;
    try {
      await cancelar.mutateAsync({ id: m.id, datos: { motivo } });
      setCancelando(false);
    } catch (err) {
      setCancelando(false);
      mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos cancelar la membresía. Inténtalo de nuevo.' });
    }
  }

  const m = cliente?.membresia;
  return (
    <section aria-labelledby="titulo-membresia" className="mb-6">
      <h2 id="titulo-membresia" className="mb-2 text-subtitulo text-asfalto-900">Membresía</h2>
      {!cliente ? <Esqueleto className="h-24 w-full" /> : (
        <Tarjeta className="space-y-3">
          {m ? (
            <>
              <p className="text-cuerpo font-semibold">{m.plan.nombre} · {formatoDinero(m.plan.precio)}</p>
              <InsigniaEstado estado={m.estado} diasRestantes={m.dias_restantes} />
              <p className="text-apoyo text-asfalto-700">Vence el {formatoFecha(m.fecha_vencimiento)}</p>
              <Link to={`/pagos/nuevo?membresia=${m.id}`} className="inline-flex h-11 items-center rounded-control bg-senal-400 px-4 font-semibold text-asfalto-900">Registrar pago</Link>
              <div className="flex flex-wrap gap-4">
                <button type="button" onClick={() => setCambiando(true)} className="min-h-11 text-cuerpo text-info underline">Cambiar plan</button>
                {esAdmin && <button type="button" onClick={() => setCancelando(true)} className="min-h-11 text-cuerpo text-peligro-texto underline">Cancelar membresía</button>}
              </div>
            </>
          ) : (
            <>
              <p className="text-cuerpo text-asfalto-700">Este cliente no tiene membresía.</p>
              <Boton onClick={() => setCreando(true)}>Crear membresía</Boton>
            </>
          )}
        </Tarjeta>
      )}

      {cliente && !m && <HojaCrearMembresia abierta={abrirCrear} alCerrar={cerrarCrear} cliente={{ id: cliente.id, nombre: cliente.nombre }} />}
      {cliente && m && <HojaCambiarPlan abierta={cambiando} alCerrar={() => setCambiando(false)} membresia={m} />}
      {cliente && m && (
        <DialogoConfirmar
          abierta={cancelando}
          titulo={`¿Cancelar la membresía de ${cliente.nombre}?`}
          texto="Esta acción es definitiva. Para volver, habrá que crear una membresía nueva."
          textoConfirmar="Cancelar membresía"
          textoCancelar="Volver"
          varianteConfirmar="peligro"
          pedirMotivo
          cargando={cancelar.isPending}
          alConfirmar={(motivo) => void confirmarCancelacion(motivo)}
          alCancelar={() => setCancelando(false)}
        />
      )}
    </section>
  );
}
