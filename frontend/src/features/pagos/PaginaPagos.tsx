import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FiltrosPagos, Pago } from '@/api';
import { usePagos } from '@/api/hooks';
import { METODOS } from '@/features/membresias/esquemas';
import { hoyBogota, sumarDias } from '@/lib/fechas';
import { formatoDinero, formatoFechaHora } from '@/lib/formato';
import { Boton, CabeceraPagina, Campo, Elemento, Entrada, EstadoError, EstadoVacio, Esqueleto, GrupoOpciones, Insignia, ListaElementos, Paginador, Selector } from '@/ui';
import { HojaDetallePago } from './HojaDetallePago';

type Rango = 'hoy' | '7dias' | 'mes' | 'personalizado';
const RANGOS: { valor: Rango; etiqueta: string }[] = [
  { valor: 'hoy', etiqueta: 'Hoy' },
  { valor: '7dias', etiqueta: 'Últimos 7 días' },
  { valor: 'mes', etiqueta: 'Este mes' },
  { valor: 'personalizado', etiqueta: 'Personalizado' },
];
const POR_PAGINA = 20;

function fechasDelRango(rango: Rango, desde: string, hasta: string): { desde?: string; hasta?: string } {
  const hoy = hoyBogota();
  if (rango === 'hoy') return { desde: hoy, hasta: hoy };
  if (rango === '7dias') return { desde: sumarDias(hoy, -6), hasta: hoy };
  if (rango === 'mes') return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  return { desde: desde || undefined, hasta: hasta || undefined };
}

/** Lista de pagos (`/pagos`). Por defecto, los de hoy; los filtros viven en la URL. */
export function PaginaPagos() {
  const [params, setParams] = useSearchParams();
  const [abierto, setAbierto] = useState<Pago | null>(null);

  const rangoCrudo = params.get('rango');
  const rango: Rango = RANGOS.some((r) => r.valor === rangoCrudo) ? (rangoCrudo as Rango) : 'hoy';
  const desde = params.get('desde') ?? '';
  const hasta = params.get('hasta') ?? '';
  const metodoCrudo = params.get('metodo');
  const metodo = METODOS.find((m) => m.valor === metodoCrudo)?.valor;
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);

  const cambiar = (cambios: Record<string, string | null>) => {
    const nuevo = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? nuevo.set(k, v) : nuevo.delete(k)));
    if (!('pagina' in cambios)) nuevo.delete('pagina');
    setParams(nuevo, { replace: true });
  };

  const filtros: FiltrosPagos = { ...fechasDelRango(rango, desde, hasta), metodo, pagina, por_pagina: POR_PAGINA };
  const consulta = usePagos(filtros);
  const datos = consulta.data;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;

  return (
    <div>
      <CabeceraPagina
        titulo="Pagos"
        accion={<Link to="/pagos/nuevo" className="inline-flex h-11 items-center rounded-control bg-senal-400 px-4 font-semibold text-asfalto-900">Registrar pago</Link>}
      />
      <div className="mb-4 space-y-3">
        <GrupoOpciones
          etiqueta="Periodo"
          valor={rango}
          onChange={(v) => cambiar({ rango: v === 'hoy' ? null : v, desde: null, hasta: null })}
          opciones={RANGOS}
        />
        {rango === 'personalizado' && (
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde"><Entrada type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value || null })} /></Campo>
            <Campo etiqueta="Hasta"><Entrada type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value || null })} /></Campo>
          </div>
        )}
        <Campo etiqueta="Método">
          <Selector value={metodo ?? ''} onChange={(e) => cambiar({ metodo: e.target.value || null })}>
            <option value="">Todos los métodos</option>
            {METODOS.map((m) => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
          </Selector>
        </Campo>
      </div>

      {consulta.isLoading && <div className="space-y-2"><Esqueleto className="h-16 w-full" /><Esqueleto className="h-16 w-full" /></div>}
      {consulta.isError && <EstadoError mensaje="No pudimos cargar esta información." alReintentar={() => void consulta.refetch()} />}

      {datos && datos.items.length === 0 && (
        <EstadoVacio titulo="No hay pagos en este periodo." accion={metodo ? <Boton variante="secundario" onClick={() => cambiar({ metodo: null })}>Limpiar filtros</Boton> : undefined} />
      )}
      {datos && datos.items.length > 0 && (
        <>
          <h2 className="mb-2 text-subtitulo text-asfalto-900">{datos.total} {datos.total === 1 ? 'pago' : 'pagos'}</h2>
          <ListaElementos etiqueta="Lista de pagos">
            {datos.items.map((p) => (
              <Elemento
                key={p.id}
                alClic={() => setAbierto(p)}
                titulo={p.cliente.nombre}
                subtitulo={`${formatoFechaHora(p.creado_en)} · ${METODOS.find((m) => m.valor === p.metodo)?.etiqueta ?? p.metodo} · Registró: ${p.registrado_por.nombre}`}
                fin={
                  <span className="flex items-center gap-2">
                    <span className={p.anulado ? 'text-cuerpo font-semibold tabular-nums line-through' : 'text-cuerpo font-semibold tabular-nums'}>{formatoDinero(p.monto)}</span>
                    {p.anulado && <Insignia tono="neutro">Anulado</Insignia>}
                  </span>
                }
              />
            ))}
          </ListaElementos>
          <Paginador className="mt-4" pagina={pagina} paginas={paginas} alCambiar={(n) => cambiar({ pagina: n > 1 ? String(n) : null })} />
        </>
      )}

      <HojaDetallePago pago={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  );
}
