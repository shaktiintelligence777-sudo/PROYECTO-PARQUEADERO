import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Membresia } from '@/api';
import { formatoDiasRestantes } from '@/lib/formato';
import { EstadoVacio, InsigniaEstado, ListaElementos, Placa } from '@/ui';

/** Hasta 5 membresías por vencer o vencidas; cada una lleva a la ficha del cliente. */
export function ProximosVencimientos({ membresias }: { membresias: Membresia[] }) {
  return (
    <section aria-labelledby="titulo-vencimientos">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="titulo-vencimientos" className="text-subtitulo text-asfalto-900">Próximos vencimientos</h2>
        <Link to="/membresias" className="min-h-11 content-center text-cuerpo text-info underline">Ver todas</Link>
      </div>
      {membresias.length === 0 ? (
        <EstadoVacio titulo="Ninguna membresía vence en los próximos días." />
      ) : (
        <ListaElementos etiqueta="Próximos vencimientos">
          {membresias.map((m) => {
            const [primera, ...otras] = m.placas ?? [];
            return (
              <li key={m.id}>
                <Link to={`/clientes/${m.cliente.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2 transition-colors duration-150 ease-out hover:bg-asfalto-50">
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-cuerpo font-semibold text-asfalto-900">{m.cliente.nombre}</span>
                      <InsigniaEstado estado={m.estado} />
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-apoyo text-asfalto-500">
                      {primera && <Placa placa={primera} tamano="sm" />}
                      {otras.length > 0 && <span>+{otras.length}</span>}
                      <span>{formatoDiasRestantes(m.dias_restantes)}</span>
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-asfalto-500" />
                </Link>
              </li>
            );
          })}
        </ListaElementos>
      )}
    </section>
  );
}
