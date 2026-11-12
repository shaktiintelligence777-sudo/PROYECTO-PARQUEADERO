import { Link } from 'react-router-dom';
import { esVisitanteCasual } from '@/api';
import { useMotosDentro, useResumenDashboard } from '@/api/hooks';
import { useSesion } from '@/features/auth/ProveedorSesion';
import { formatoDinero, formatoFechaCorta } from '@/lib/formato';
import { Aviso, CabeceraPagina, EstadoError, Esqueleto, Indicador } from '@/ui';
import { ProximosVencimientos } from './ProximosVencimientos';

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando el resumen" role="status" className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => <Esqueleto key={i} className="h-24 w-full" />)}
      </div>
      <div className="space-y-2"><Esqueleto className="h-16 w-full" /><Esqueleto className="h-16 w-full" /><Esqueleto className="h-16 w-full" /></div>
    </div>
  );
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Cifra con su unidad al lado ("12 motos adentro"), con singular cuando es 1. */
function Cifra({ n, unidad }: { n: number | string; unidad: string }) {
  return <>{n}{' '}<span className="block text-apoyo font-normal text-asfalto-700">{unidad}</span></>;
}

/** P2 · Dashboard (`/`). Todas las cifras vienen del resumen de la API: no se calcula nada aquí. */
export function PaginaDashboard() {
  const usuario = useSesion().usuario;
  const consulta = useResumenDashboard();
  const r = consulta.data;
  // Solo demo: el contrato aún no separa membresías de diarios, así que se cuentan desde la lista de motos dentro.
  const dentro = useMotosDentro(undefined, 60_000).data;
  const diarios = dentro ? dentro.items.filter(esVisitanteCasual).length : null;
  const conMembresia = dentro && diarios !== null ? dentro.items.length - diarios : null;
  const saludo = `Hola, ${usuario ? primerNombre(usuario.nombre) : ''}${r ? ` · ${formatoFechaCorta(r.fecha)}` : ''}`;

  return (
    <div>
      <CabeceraPagina titulo="Inicio" />
      <p className="-mt-2 mb-4 text-cuerpo text-asfalto-700">{saludo}</p>

      {consulta.isLoading && <Cargando />}
      {consulta.isError && !r && <EstadoError mensaje="No pudimos cargar esta información." alReintentar={() => void consulta.refetch()} />}

      {r && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Indicador etiqueta="Dentro ahora" valor={<Cifra n={r.motos_dentro} unidad={plural(r.motos_dentro, 'moto adentro', 'motos adentro')} />} detalle={r.capacidad === null ? undefined : `Capacidad: ${r.capacidad}`} enlace="/acceso?vista=dentro" />
            <Indicador etiqueta="De ellas" valor={conMembresia === null ? '–' : <Cifra n={conMembresia} unidad={plural(conMembresia, 'membresía', 'membresías')} />} enlace="/acceso?vista=dentro" />
            <Indicador etiqueta="De ellas" valor={diarios === null ? '–' : <Cifra n={diarios} unidad={plural(diarios, 'diario', 'diarios')} />} enlace="/acceso?vista=dentro" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
