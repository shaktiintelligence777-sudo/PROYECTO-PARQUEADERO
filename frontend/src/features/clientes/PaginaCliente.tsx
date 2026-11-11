import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorApi, type Moto } from '@/api';
import { useCliente, useHistorialAccesos, usePagos } from '@/api/hooks';
import { useSesion } from '@/features/auth/ProveedorSesion';
import { formatoDinero, formatoDuracion, formatoFecha, formatoFechaHora } from '@/lib/formato';
import {
  Aviso, Boton, BotonIcono, CabeceraPagina, Elemento, EstadoError, EstadoVacio, Esqueleto, GrupoOpciones, Insignia, ListaElementos, Placa,
} from '@/ui';
import { HojaEditarCliente } from './HojaEditarCliente';
import { HojaMoto } from './HojaMoto';
import { SeccionMembresia } from '@/features/membresias/SeccionMembresia';

const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', otro: 'Otro' } as const;
type Pestana = 'pagos' | 'accesos';

/** P4 · Ficha del cliente (`/clientes/:id`). */
export function PaginaCliente() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const esAdmin = useSesion().usuario?.rol === 'admin';
  const consulta = useCliente(id);
  const [editando, setEditando] = useState(false);
  const [motoAbierta, setMotoAbierta] = useState<{ moto?: Moto } | null>(null);
  const [pestana, setPestana] = useState<Pestana>('pagos');

  if (consulta.isLoading) {
    return <div className="space-y-3"><Esqueleto className="h-8 w-2/3" /><Esqueleto className="h-5 w-1/2" /><Esqueleto className="h-32 w-full" /></div>;
  }
  if (consulta.isError || !consulta.data) {
    const noExiste = consulta.error instanceof ErrorApi && consulta.error.codigo === 'no_encontrado';
    return (
      <>
        <CabeceraPagina titulo="Cliente" alVolver={() => navegar('/clientes')} />
        <EstadoError mensaje={noExiste ? 'No encontramos ese cliente.' : 'No pudimos cargar esta información.'} alReintentar={noExiste ? undefined : () => void consulta.refetch()} />
      </>
    );
  }

  const cliente = consulta.data;
  const motos = esAdmin ? cliente.motos : cliente.motos.filter((m) => m.activo);

  return (
    <div>
      <CabeceraPagina
        titulo={cliente.nombre}
        alVolver={() => navegar('/clientes')}
        accion={<Boton variante="secundario" onClick={() => setEditando(true)}>Editar</Boton>}
      />
      <div className="mb-4 space-y-1 text-cuerpo text-asfalto-700">
        <p>
          {cliente.telefono && <a href={`tel:${cliente.telefono}`} className="text-info underline">{cliente.telefono}</a>}
          {!cliente.activo && <Insignia tono="neutro" className="ml-2">Inactivo</Insignia>}
        </p>
        {cliente.email && <p>{cliente.email}</p>}
        {cliente.notas && <p className="text-apoyo text-asfalto-500">{cliente.notas}</p>}
      </div>
      {!cliente.email && <Aviso tono="aviso" className="mb-4">Sin email: no recibirá avisos de vencimiento.</Aviso>}

      <SeccionMembresia clienteId={cliente.id} />

      <section aria-labelledby="titulo-motos" className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="titulo-motos" className="text-subtitulo text-asfalto-900">Motos</h2>
          <Boton variante="secundario" onClick={() => setMotoAbierta({})}>+ Moto</Boton>
        </div>
        {motos.length === 0 ? (
          <EstadoVacio titulo="Este cliente no tiene motos." />
        ) : (
          <ListaElementos etiqueta="Motos del cliente">
            {motos.map((m) => (
              <Elemento
                key={m.id}
                inicio={<Placa placa={m.placa} />}
                titulo={[m.marca, m.color].filter(Boolean).join(' · ') || 'Sin marca ni color'}
                fin={
                  <span className="flex items-center gap-2">
                    {m.dentro && <Insignia tono="info">Dentro</Insignia>}
                    {!m.activo && <Insignia tono="neutro">Inactiva</Insignia>}
                    <BotonIcono aria-label={`Editar moto ${m.placa}`} onClick={() => setMotoAbierta({ moto: m })}><Pencil aria-hidden="true" className="size-5" /></BotonIcono>
                  </span>
                }
              />
            ))}
          </ListaElementos>
        )}
      </section>

      <GrupoOpciones
        etiqueta="Historial del cliente"
        valor={pestana}
        onChange={setPestana}
        className="mb-3"
        opciones={[{ valor: 'pagos', etiqueta: 'Pagos' }, ...(esAdmin ? [{ valor: 'accesos' as const, etiqueta: 'Accesos' }] : [])]}
      />
      {pestana === 'pagos' || !esAdmin ? <PestanaPagos clienteId={cliente.id} /> : <PestanaAccesos clienteId={cliente.id} />}

      <HojaEditarCliente abierta={editando} alCerrar={() => setEditando(false)} cliente={cliente} esAdmin={esAdmin} />
      <HojaMoto abierta={motoAbierta !== null} alCerrar={() => setMotoAbierta(null)} clienteId={cliente.id} moto={motoAbierta?.moto} esAdmin={esAdmin} />
    </div>
  );
}

function PestanaPagos({ clienteId }: { clienteId: string }) {
  const pagos = usePagos({ cliente_id: clienteId, incluir_anulados: true });
  if (pagos.isLoading) return <Esqueleto className="h-24 w-full" />;
  if (pagos.isError) return <EstadoError mensaje="No pudimos cargar esta información." alReintentar={() => void pagos.refetch()} />;
  if (!pagos.data?.items.length) return <EstadoVacio titulo="Este cliente aún no tiene pagos." />;
  return (
    <ListaElementos etiqueta="Pagos del cliente">
      {pagos.data.items.map((p) => (
        <Elemento
          key={p.id}
          titulo={<span className={p.anulado ? 'line-through' : undefined}>{formatoFecha(p.creado_en)} · {formatoDinero(p.monto)}</span>}
          subtitulo={`${p.plan.nombre} · ${METODOS[p.metodo]}`}
          fin={p.anulado ? <Insignia tono="neutro">Anulado</Insignia> : undefined}
        />
      ))}
    </ListaElementos>
  );
}

function PestanaAccesos({ clienteId }: { clienteId: string }) {
  const accesos = useHistorialAccesos({ cliente_id: clienteId });
  if (accesos.isLoading) return <Esqueleto className="h-24 w-full" />;
  if (accesos.isError) return <EstadoError mensaje="No pudimos cargar esta información." alReintentar={() => void accesos.refetch()} />;
  if (!accesos.data?.items.length) return <EstadoVacio titulo="Este cliente aún no tiene accesos." />;
  return (
    <ListaElementos etiqueta="Accesos del cliente">
      {accesos.data.items.map((e) => (
        <Elemento
          key={e.id}
          inicio={<Placa placa={e.moto.placa} tamano="sm" />}
          titulo={`Entrada ${formatoFechaHora(e.entrada_en)}`}
          subtitulo={e.salida_en ? `Salida ${formatoFechaHora(e.salida_en)} · ${formatoDuracion(e.duracion_minutos)}` : 'Sigue dentro'}
        />
      ))}
    </ListaElementos>
  );
}
