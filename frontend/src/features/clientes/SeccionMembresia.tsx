import { Link } from 'react-router-dom';
import { useCliente } from '@/api/hooks';
import { formatoDinero, formatoFecha } from '@/lib/formato';
import { Esqueleto, InsigniaEstado, Tarjeta } from '@/ui';

/**
 * Hueco de la ficha para la tarjeta de membresía. Versión PROVISIONAL de solo lectura:
 * A-07 la reemplaza con crear membresía, cambiar plan y cancelar (y atiende `?crear_membresia=1`).
 */
export function SeccionMembresia({ clienteId }: { clienteId: string }) {
  const { data: cliente } = useCliente(clienteId);
  const m = cliente?.membresia;
  return (
    <section aria-labelledby="titulo-membresia" className="mb-6">
      <h2 id="titulo-membresia" className="mb-2 text-subtitulo text-asfalto-900">Membresía</h2>
      {!cliente ? <Esqueleto className="h-24 w-full" /> : (
        <Tarjeta className="space-y-2">
          {m ? (
            <>
              <p className="text-cuerpo font-semibold">{m.plan.nombre} · {formatoDinero(m.plan.precio)}</p>
              <InsigniaEstado estado={m.estado} diasRestantes={m.dias_restantes} />
              <p className="text-apoyo text-asfalto-700">Vence el {formatoFecha(m.fecha_vencimiento)}</p>
              <Link to={`/pagos/nuevo?membresia=${m.id}`} className="inline-flex h-11 items-center rounded-control bg-senal-400 px-4 font-semibold text-asfalto-900">Registrar pago</Link>
            </>
          ) : (
            <p className="text-cuerpo text-asfalto-700">Este cliente no tiene membresía.</p>
          )}
        </Tarjeta>
      )}
    </section>
  );
}
