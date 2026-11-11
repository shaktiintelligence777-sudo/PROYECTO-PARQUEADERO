import { ChevronRight } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import type { EstadoMembresia, Membresia } from '@/api';
import { useMembresias } from '@/api/hooks';
import { formatoDiasRestantes, formatoFecha } from '@/lib/formato';
import {
  Boton, Buscador, CabeceraPagina, EstadoError, EstadoVacio, Esqueleto, GrupoOpciones, InsigniaEstado, ListaElementos, Paginador, Placa,
  Tabla, type Columna,
} from '@/ui';

const FILTROS: { valor: EstadoMembresia | 'todas'; etiqueta: string }[] = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'por_vencer', etiqueta: 'Por vencer' },
  { valor: 'vencida', etiqueta: 'Vencidas' },
  { valor: 'activa', etiqueta: 'Activas' },
  { valor: 'cancelada', etiqueta: 'Canceladas' },
];
const POR_PAGINA = 20;

const Renovar = ({ m }: { m: Membresia }) =>
  m.estado === 'cancelada' ? null : (
    <Link to={`/pagos/nuevo?membresia=${m.id}`} className="inline-flex h-11 items-center rounded-control border border-asfalto-300 bg-blanco px-4 font-semibold text-asfalto-900">Renovar</Link>
  );

/** P6 · Membresías (`/membresias`). Filtros y página en la URL; orden por vencimiento (lo hace la API). */
export function PaginaMembresias() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const [reinicios, setReinicios] = useState(0);

  const q = params.get('q') ?? '';
  const crudo = params.get('estado');
  const estado = FILTROS.some((f) => f.valor === crudo) && crudo !== 'todas' ? (crudo as EstadoMembresia) : null;
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);

  const cambiar = (cambios: Record<string, string | null>) => {
    const nuevo = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? nuevo.set(k, v) : nuevo.delete(k)));
    if (!('pagina' in cambios)) nuevo.delete('pagina');
    setParams(nuevo, { replace: true });
  };

  const consulta = useMembresias({ q: q || undefined, estado: estado ?? undefined, pagina, por_pagina: POR_PAGINA });
  const datos = consulta.data;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;

  const columnas: Columna<Membresia>[] = [
    { clave: 'cliente', encabezado: 'Cliente', celda: (m) => <Link to={`/clientes/${m.cliente.id}`} className="font-semibold text-asfalto-900 hover:underline">{m.cliente.nombre}</Link> },
    { clave: 'plan', encabezado: 'Plan', celda: (m) => m.plan.nombre },
    { clave: 'inicio', encabezado: 'Inicio', celda: (m) => formatoFecha(m.fecha_inicio) },
    { clave: 'vence', encabezado: 'Vence', celda: (m) => formatoFecha(m.fecha_vencimiento) },
    { clave: 'estado', encabezado: 'Estado', celda: (m) => <InsigniaEstado estado={m.estado} /> },
    { clave: 'acciones', encabezado: 'Acciones', celda: (m) => <Renovar m={m} /> },
  ];

  return (
    <div>
      <CabeceraPagina titulo="Membresías" />
      <div className="mb-4 space-y-3">
        <Buscador key={reinicios} etiqueta="Buscar membresías" placeholder="Cliente o placa" valorInicial={q} alBuscar={(t) => cambiar({ q: t.trim() || null })} />
        <GrupoOpciones etiqueta="Estado de la membresía" valor={estado ?? 'todas'} onChange={(v) => cambiar({ estado: v === 'todas' ? null : v })} opciones={FILTROS} />
      </div>

      {consulta.isLoading && <div className="space-y-2"><Esqueleto className="h-20 w-full" /><Esqueleto className="h-20 w-full" /><Esqueleto className="h-20 w-full" /></div>}
      {consulta.isError && <EstadoError mensaje="No pudimos cargar esta información." alReintentar={() => void consulta.refetch()} />}

      {datos && datos.items.length === 0 && (
        <EstadoVacio
          titulo="No hay membresías con este filtro."
          accion={(q || estado) ? <Boton variante="secundario" onClick={() => { setParams({}, { replace: true }); setReinicios((n) => n + 1); }}>Limpiar filtros</Boton> : undefined}
        />
      )}

      {datos && datos.items.length > 0 && (
        <>
          <ListaElementos etiqueta="Lista de membresías" className="md:hidden">
            {datos.items.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-4 py-2">
                <Link to={`/clientes/${m.cliente.id}`} className="min-w-0 flex-1 space-y-1 py-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-cuerpo font-semibold text-asfalto-900">{m.cliente.nombre}</span>
                    <InsigniaEstado estado={m.estado} />
                  </span>
                  <span className="block truncate text-apoyo text-asfalto-500">{m.plan.nombre} · {formatoDiasRestantes(m.dias_restantes)}</span>
                  <span className="flex flex-wrap gap-1">{m.placas?.slice(0, 2).map((p) => <Placa key={p} placa={p} tamano="sm" />)}</span>
                </Link>
                <Renovar m={m} />
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-asfalto-500" />
              </li>
            ))}
          </ListaElementos>
          <Tabla className="hidden md:block" descripcion="Tabla de membresías" columnas={columnas} filas={datos.items} claveFila={(m) => m.id} alClicFila={(m) => navegar(`/clientes/${m.cliente.id}`)} />
          <Paginador className="mt-4" pagina={pagina} paginas={paginas} alCambiar={(p) => cambiar({ pagina: p > 1 ? String(p) : null })} />
        </>
      )}
    </div>
  );
}
