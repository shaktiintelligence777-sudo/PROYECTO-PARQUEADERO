import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ClienteResumen, FiltrosClientes } from '@/api';
import { useClientes } from '@/api/hooks';
import { useSesion } from '@/features/auth/ProveedorSesion';
import { formatoFecha } from '@/lib/formato';
import {
  Boton, Buscador, CabeceraPagina, Elemento, EstadoError, EstadoVacio, Esqueleto, GrupoOpciones, Insignia, InsigniaEstado, ListaElementos,
  Paginador, Placa, Tabla, type Columna,
} from '@/ui';

type Estado = NonNullable<FiltrosClientes['estado_membresia']>;
const ESTADOS: { valor: Estado | 'todos'; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'activa', etiqueta: 'Activa' },
  { valor: 'por_vencer', etiqueta: 'Por vencer' },
  { valor: 'vencida', etiqueta: 'Vencida' },
  { valor: 'sin_membresia', etiqueta: 'Sin membresía' },
];
const POR_PAGINA = 20;

function Placas({ placas }: { placas: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {placas.slice(0, 2).map((p) => <Placa key={p} placa={p} tamano="sm" />)}
      {placas.length > 2 && <span className="text-apoyo text-asfalto-500">+{placas.length - 2}</span>}
    </span>
  );
}

/** P4 · Lista de clientes (`/clientes`). Filtros y página viven en la URL. */
export function PaginaClientes() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const esAdmin = useSesion().usuario?.rol === 'admin';
  const [reinicios, setReinicios] = useState(0); // cambia al limpiar filtros para vaciar el texto del buscador

  const q = params.get('q') ?? '';
  const estadoCrudo = params.get('estado');
  const estado = ESTADOS.some((e) => e.valor === estadoCrudo) && estadoCrudo !== 'todos' ? (estadoCrudo as Estado) : null;
  const inactivos = esAdmin && params.get('inactivos') === '1';
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const hayFiltros = q !== '' || estado !== null || inactivos;

  /** Cualquier cambio de filtro vuelve a la página 1 (se borra `pagina`). */
  const cambiar = (cambios: Record<string, string | null>) => {
    const nuevo = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? nuevo.set(k, v) : nuevo.delete(k)));
    if (!('pagina' in cambios)) nuevo.delete('pagina');
    setParams(nuevo, { replace: true });
  };

  const consulta = useClientes({
    q: q || undefined, estado_membresia: estado ?? undefined, activo: inactivos ? false : undefined, pagina, por_pagina: POR_PAGINA,
  });
  const datos = consulta.data;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;

  const columnas: Columna<ClienteResumen>[] = [
    { clave: 'nombre', encabezado: 'Nombre', celda: (c) => <Link to={`/clientes/${c.id}`} className="font-semibold text-asfalto-900 hover:underline">{c.nombre}</Link> },
    { clave: 'documento', encabezado: 'Documento', celda: (c) => c.documento },
    { clave: 'telefono', encabezado: 'Teléfono', celda: (c) => c.telefono },
    { clave: 'placas', encabezado: 'Placas', celda: (c) => <Placas placas={c.placas} /> },
    { clave: 'membresia', encabezado: 'Membresía', celda: (c) => <InsigniaEstado estado={c.membresia?.estado ?? null} /> },
    { clave: 'vence', encabezado: 'Vence', celda: (c) => (c.membresia ? formatoFecha(c.membresia.fecha_vencimiento) : '—') },
  ];

  return (
    <div>
      <CabeceraPagina
        titulo="Clientes"
        accion={<Link to="/clientes/nuevo" className="inline-flex h-11 items-center gap-2 rounded-control bg-senal-400 px-4 font-semibold text-asfalto-900"><Plus aria-hidden="true" className="size-5" />Nuevo</Link>}
      />
      <div className="mb-4 space-y-3">
        <Buscador
          key={reinicios}
          etiqueta="Buscar clientes"
          placeholder="Nombre, documento o placa"
          valorInicial={q}
          alBuscar={(t) => cambiar({ q: t.trim() || null })}
        />
        <GrupoOpciones
          etiqueta="Estado de la membresía"
          valor={estado ?? 'todos'}
          onChange={(v) => cambiar({ estado: v === 'todos' ? null : v })}
          opciones={ESTADOS}
        />
        {esAdmin && (
          <label className="flex min-h-11 items-center gap-2 text-cuerpo text-asfalto-900">
            <input type="checkbox" className="size-5" checked={inactivos} onChange={(e) => cambiar({ inactivos: e.target.checked ? '1' : null })} />
            Mostrar inactivos
          </label>
        )}
      </div>

      {consulta.isLoading && <div className="space-y-2"><Esqueleto className="h-16 w-full" /><Esqueleto className="h-16 w-full" /><Esqueleto className="h-16 w-full" /></div>}
      {consulta.isError && <EstadoError mensaje="No pudimos cargar esta información." alReintentar={() => void consulta.refetch()} />}

      {datos && datos.items.length === 0 && (
        hayFiltros ? (
          <EstadoVacio
            titulo="Ningún cliente coincide con la búsqueda."
            accion={<Boton variante="secundario" onClick={() => { setParams({}, { replace: true }); setReinicios((n) => n + 1); }}>Limpiar filtros</Boton>}
          />
        ) : (
          <EstadoVacio
            titulo="Aún no hay clientes."
            accion={<Link to="/clientes/nuevo" className="inline-flex h-11 items-center rounded-control bg-senal-400 px-4 font-semibold text-asfalto-900">Registrar el primero</Link>}
          />
        )
      )}

      {datos && datos.items.length > 0 && (
        <>
          <ListaElementos etiqueta="Lista de clientes" className="md:hidden">
            {datos.items.map((c) => (
              <Elemento
                key={c.id}
                para={`/clientes/${c.id}`}
                titulo={c.nombre}
                subtitulo={c.placas.length > 0 ? <Placas placas={c.placas} /> : undefined}
                fin={
                  <span className="flex items-center gap-2">
                    {!c.activo && <Insignia tono="neutro">Inactivo</Insignia>}
                    <InsigniaEstado estado={c.membresia?.estado ?? null} />
                    <ChevronRight aria-hidden="true" className="size-5 text-asfalto-500" />
                  </span>
                }
              />
            ))}
          </ListaElementos>
          <Tabla
            className="hidden md:block"
            descripcion="Tabla de clientes"
            columnas={columnas}
            filas={datos.items}
            claveFila={(c) => c.id}
            alClicFila={(c) => navegar(`/clientes/${c.id}`)}
          />
          <Paginador className="mt-4" pagina={pagina} paginas={paginas} alCambiar={(p) => cambiar({ pagina: p > 1 ? String(p) : null })} />
        </>
      )}
    </div>
  );
}
