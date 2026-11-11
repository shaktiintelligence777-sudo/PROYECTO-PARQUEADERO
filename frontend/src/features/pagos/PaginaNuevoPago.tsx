import { Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi, type PagoRegistrado as Resultado } from '@/api';
import { useMembresia, useMembresias, useRegistrarPago, useVistaPreviaPago } from '@/api/hooks';
import { METODOS, mensajeNotaPago, MAX_NOTA, type MetodoPago } from '@/features/membresias/esquemas';
import { formatoDiasRestantes, formatoDinero } from '@/lib/formato';
import {
  AreaTexto, Aviso, Boton, BotonIcono, Buscador, Campo, CabeceraPagina, Elemento, EntradaDinero, EstadoVacio, GrupoOpciones, InsigniaEstado,
  ListaElementos, Tarjeta, useToast,
} from '@/ui';
import { esquemaPago, PERIODOS_MAX, PERIODOS_MIN } from './esquemas';
import { PagoRegistrado } from './PagoRegistrado';
import { ResumenPago } from './ResumenPago';

/** P7 · Registrar pago (`/pagos/nuevo`). `?membresia=<id>` trae la membresía elegida. */
export function PaginaNuevoPago() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const membresiaId = params.get('membresia');
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const elegir = (id: string | null) => setParams(id ? { membresia: id } : {}, { replace: true });

  if (resultado) {
    return <PagoRegistrado resultado={resultado} alOtroPago={() => { setResultado(null); elegir(null); }} />;
  }
  return (
    <div className="mx-auto max-w-hoja">
      <CabeceraPagina titulo="Registrar pago" alVolver={() => navegar(-1)} />
      {membresiaId
        ? <FormularioPago key={membresiaId} membresiaId={membresiaId} alCambiar={() => elegir(null)} alRegistrar={setResultado} />
        : <ElegirMembresia alElegir={elegir} />}
    </div>
  );
}

function ElegirMembresia({ alElegir }: { alElegir: (id: string) => void }) {
  const [q, setQ] = useState('');
  const resultados = useMembresias({ q: q || undefined });
  return (
    <div className="space-y-3">
      <Buscador etiqueta="Buscar membresía" placeholder="Busca por nombre, documento o placa" alBuscar={(t) => setQ(t.trim())} />
      {q !== '' && resultados.data && resultados.data.items.length === 0 && <EstadoVacio titulo="No hay membresías con este filtro." />}
      {q !== '' && resultados.data && resultados.data.items.length > 0 && (
        <ListaElementos etiqueta="Resultados">
          {resultados.data.items.map((m) => (
            <Elemento
              key={m.id}
              titulo={m.cliente.nombre}
              subtitulo={`${m.plan.nombre} · ${formatoDiasRestantes(m.dias_restantes)}`}
              fin={<InsigniaEstado estado={m.estado} />}
              alClic={() => alElegir(m.id)}
            />
          ))}
        </ListaElementos>
      )}
    </div>
  );
}

function FormularioPago({ membresiaId, alCambiar, alRegistrar }: { membresiaId: string; alCambiar: () => void; alRegistrar: (r: Resultado) => void }) {
  const { mostrar } = useToast();
  const membresia = useMembresia(membresiaId);
  const registrar = useRegistrarPago();
  const [periodos, setPeriodos] = useState(PERIODOS_MIN);
  const [monto, setMonto] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [nota, setNota] = useState('');
  const [errorNota, setErrorNota] = useState('');
  const editadoAMano = useRef(false); // el monto se sobrescribe con el sugerido solo si nadie lo tocó
  const enCurso = useRef(false);

  const vista = useVistaPreviaPago({ membresia_id: membresiaId, periodos });
  const sugerido = vista.data?.monto_sugerido;

  useEffect(() => {
    if (sugerido !== undefined && !editadoAMano.current) setMonto(sugerido);
  }, [sugerido]);

  const errorVista = vista.error instanceof ErrorApi ? vista.error : null;
  const m = membresia.data;
  const distinto = sugerido !== undefined && monto !== sugerido;

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (sugerido === undefined || enCurso.current) return;
    const r = esquemaPago(sugerido).safeParse({ periodos, monto, metodo, nota });
    if (!r.success) {
      setErrorNota(r.error.issues.find((i) => i.path[0] === 'nota')?.message ?? '');
      return;
    }
    setErrorNota('');
    enCurso.current = true; // un doble toque no crea dos pagos
    try {
      const res = await registrar.mutateAsync({ membresia_id: membresiaId, monto: r.data.monto, metodo: r.data.metodo, periodos: r.data.periodos, nota: r.data.nota || null });
      alRegistrar(res);
    } catch (err) {
      mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos registrar el pago. Inténtalo de nuevo.' });
    } finally {
      enCurso.current = false;
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
      <section aria-label="Cliente">
        <h2 className="mb-1 text-apoyo font-semibold text-asfalto-700">Cliente</h2>
        <Tarjeta className="space-y-1">
          {m ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-cuerpo font-semibold">{m.cliente.nombre}</span>
                <InsigniaEstado estado={m.estado} />
              </div>
              <p className="text-apoyo text-asfalto-500">{m.plan.nombre} · {formatoDiasRestantes(m.dias_restantes)}</p>
            </>
          ) : <p className="text-apoyo text-asfalto-500">Cargando…</p>}
          <button type="button" onClick={alCambiar} className="min-h-11 text-cuerpo text-info underline">Cambiar</button>
        </Tarjeta>
      </section>

      {m?.estado === 'vencida' && <Aviso tono="info">La membresía está vencida: el nuevo periodo empieza hoy.</Aviso>}
      {errorVista?.codigo === 'plan_inactivo' && (
        <Aviso tono="peligro" accion={m && <Link to={`/clientes/${m.cliente.id}`} className="font-semibold underline">Ver cliente</Link>}>
          El plan de esta membresía ya no está disponible. Cambia el plan antes de registrar el pago.
        </Aviso>
      )}
      {errorVista?.codigo === 'membresia_cancelada' && <Aviso tono="peligro">Esta membresía está cancelada.</Aviso>}
      {vista.isError && errorVista?.codigo !== 'plan_inactivo' && errorVista?.codigo !== 'membresia_cancelada' && (
        <Aviso tono="peligro" accion={<Boton variante="secundario" onClick={() => void vista.refetch()}>Reintentar</Boton>}>No pudimos cargar esta información.</Aviso>
      )}

      <div>
        <p className="mb-1 text-apoyo font-semibold text-asfalto-700" id="etiqueta-periodos">Periodos</p>
        <div className="flex items-center gap-4" role="group" aria-labelledby="etiqueta-periodos">
          <BotonIcono aria-label="Menos periodos" disabled={periodos <= PERIODOS_MIN} onClick={() => setPeriodos((p) => p - 1)}><Minus aria-hidden="true" className="size-6" /></BotonIcono>
          <output aria-live="polite" aria-label="Número de periodos" className="min-w-8 text-center text-titulo tabular-nums">{periodos}</output>
          <BotonIcono aria-label="Más periodos" disabled={periodos >= PERIODOS_MAX} onClick={() => setPeriodos((p) => p + 1)}><Plus aria-hidden="true" className="size-6" /></BotonIcono>
        </div>
      </div>

      <Campo etiqueta="Monto *">
        <EntradaDinero value={monto} onChange={(v) => { editadoAMano.current = true; setMonto(v); }} />
      </Campo>
      <GrupoOpciones etiqueta="Método de pago *" valor={metodo} onChange={setMetodo} opciones={METODOS.map((x) => ({ valor: x.valor, etiqueta: x.etiqueta }))} />
      <Campo etiqueta="Nota" error={errorNota || undefined} ayuda={distinto && !errorNota ? mensajeNotaPago(sugerido) : undefined}>
        <AreaTexto maxLength={MAX_NOTA} value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>

      <ResumenPago vista={vista.data} cargando={vista.isFetching && !vista.isError} />

      <Boton type="submit" tamano="lg" anchoCompleto cargando={registrar.isPending} disabled={!vista.data || vista.isFetching || vista.isError || monto === null}>
        Registrar {monto !== null ? formatoDinero(monto) : ''}
      </Boton>
    </form>
  );
}
