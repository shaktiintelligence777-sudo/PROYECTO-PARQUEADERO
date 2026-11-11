import { Link } from 'react-router-dom';
import { useResumenDashboard } from '@/api/hooks';
import { useSesion } from '@/features/auth/ProveedorSesion';
import { formatoDinero, formatoFechaCorta } from '@/lib/formato';
import { Aviso, CabeceraPagina, EstadoError, Esqueleto, Indicador } from '@/ui';
import { ProximosVencimientos } from './ProximosVencimientos';

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando el resumen" role="status" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Esqueleto key={i} className="h-24 w-full" />)}
      </div>
      <div className="space-y-2"><Esqueleto className="h-16 w-full" /><Esqueleto className="h-16 w-full" /><Esqueleto className="h-16 w-full" /></div>
    </div>
  );
}

/** P2 · Dashboard (`/`). Todas las cifras vienen del resumen de la API: no se calcula nada aquí. */
export function PaginaDashboard() {
  const usuario = useSesion().usuario;
  const consulta = useResumenDashboard();
  const r = consulta.data;
  const saludo = `Hola, ${usuario ? primerNombre(usuario.nombre) : ''}${r ? ` · ${formatoFechaCorta(r.fecha)}` : ''}`;

  return (
    <div>
      <CabeceraPagina titulo="Inicio" />
      <p className="-mt-2 mb-4 text-cuerpo text-asfalto-700">{saludo}</p>

      {consulta.isLoading && <Cargando />}
      {consulta.isError && !r && <EstadoError mensaje="No pudimos cargar esta información." alReintentar={() => void consulta.refetch()} />}

      {r && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicador etiqueta="Dentro ahora" valor={r.capacidad === null ? r.motos_dentro : `${r.motos_dentro} / ${r.capacidad}`} enlace="/acceso?vista=dentro" />
            <Indicador etiqueta="Por vencer" valor={r.membresias.por_vencer} tono={r.membresias.por_vencer > 0 ? 'aviso' : undefined} enlace="/membresias?estado=por_vencer" />
            <Indicador etiqueta="Vencidas" valor={r.membresias.vencidas} tono={r.membresias.vencidas > 0 ? 'peligro' : undefined} enlace="/membresias?estado=vencida" />
            <Indicador
              etiqueta="Pagos de hoy"
              valor={formatoDinero(r.pagos_hoy.total)}
              detalle={`${r.pagos_hoy.cantidad} ${r.pagos_hoy.cantidad === 1 ? 'pago' : 'pagos'}`}
              enlace="/pagos"
            />
          </div>

          {r.estancias_largas > 0 && (
            <Aviso
              tono="aviso"
              accion={<Link to="/acceso?vista=dentro" className="font-semibold underline">Ver</Link>}
            >
              {r.estancias_largas === 1 ? '1 moto lleva más de 24 h dentro.' : `${r.estancias_largas} motos llevan más de 24 h dentro.`}
            </Aviso>
          )}

          <div className="md:grid md:grid-cols-3 md:items-start md:gap-6">
            <div className="md:col-span-2"><ProximosVencimientos membresias={r.proximos_vencimientos} /></div>
            <section aria-labelledby="titulo-movimiento" className="mt-6 md:mt-0">
              <h2 id="titulo-movimiento" className="mb-2 text-subtitulo text-asfalto-900">Movimiento de hoy</h2>
              <p className="text-cuerpo text-asfalto-700">Entradas {r.entradas_hoy} · Salidas {r.salidas_hoy}</p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
