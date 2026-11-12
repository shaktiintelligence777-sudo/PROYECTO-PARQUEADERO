import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '@/api';
import { useConsultaPlaca, useRegistrarEntrada, useRegistrarSalida } from '@/api/hooks';
import { formatoDuracion } from '@/lib/formato';
import { Boton, Campo, EntradaPlaca, EstadoError, EstadoVacio, Esqueleto, useToast } from '@/ui';
import { FormularioVisitante } from './FormularioVisitante';
import { ResultadoConsulta } from './ResultadoConsulta';

const MENSAJE_FORMATO = 'La placa debe tener entre 4 y 7 letras o números.';
const CONFLICTOS = ['moto_ya_dentro', 'moto_no_esta_dentro'];

export function PanelRegistrar() {
  const qc = useQueryClient();
  const { mostrar } = useToast();
  const [placa, setPlaca] = useState('');
  const [buscada, setBuscada] = useState('');
  const [casual, setCasual] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const enCurso = useRef(false);

  const consulta = useConsultaPlaca(buscada, buscada.length >= 4);
  const entrada = useRegistrarEntrada();
  const salida = useRegistrarSalida();

  useEffect(() => { ref.current?.focus(); }, []);

  const buscar = (e?: FormEvent) => {
    e?.preventDefault();
    if (placa.length < 4) return;
    setCasual(false);
    if (placa === buscada) void consulta.refetch(); else setBuscada(placa);
  };

  const terminar = () => {
    setPlaca('');
    setBuscada('');
    setCasual(false);
    ref.current?.focus();
  };

  async function registrar(tipo: 'entrada' | 'salida') {
    if (enCurso.current) return; // un doble toque no envía dos peticiones
    enCurso.current = true;
    try {
      if (tipo === 'entrada') {
        await entrada.mutateAsync({ placa: buscada });
        mostrar({ tono: 'exito', mensaje: `Entrada registrada · ${buscada}` });
      } else {
        const r = await salida.mutateAsync({ placa: buscada });
        mostrar({ tono: 'exito', mensaje: `Salida registrada · ${buscada} · ${formatoDuracion(r.estancia.duracion_minutos)}` });
      }
      terminar();
    } catch (err) {
      if (err instanceof ErrorApi && CONFLICTOS.includes(err.codigo)) {
        mostrar({ tono: 'peligro', mensaje: err.mensaje });
        await qc.invalidateQueries({ queryKey: ['accesos', 'placa'] }); // muestra el estado real
      } else {
        mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos registrar el acceso. Inténtalo de nuevo.' });
      }
    } finally {
      enCurso.current = false;
    }
  }

  const error = consulta.error;
  const noRegistrada = error instanceof ErrorApi && error.codigo === 'moto_no_registrada';

  return (
    <section aria-label="Registrar" className="space-y-4">
      <form onSubmit={buscar} className="space-y-3" noValidate>
        <Campo etiqueta="Placa">
          <EntradaPlaca ref={ref} value={placa} onChange={setPlaca} />
        </Campo>
        <Boton type="submit" tamano="lg" anchoCompleto disabled={placa.length < 4} cargando={consulta.isFetching && !consulta.data}>Buscar</Boton>
      </form>

      {buscada && consulta.isLoading && <Esqueleto className="h-48 w-full" />}
      {consulta.data && (
        <ResultadoConsulta
          consulta={consulta.data}
          registrando={entrada.isPending || salida.isPending}
          alEntrada={() => void registrar('entrada')}
          alSalida={() => void registrar('salida')}
        />
      )}
      {noRegistrada && !casual && (
        <EstadoVacio
          titulo={`No hay ninguna moto con la placa ${buscada}.`}
          accion={
            <div className="flex w-full flex-col gap-3 sm:flex-row">
              <Link to={`/clientes/nuevo?placa=${buscada}`} className="inline-flex h-16 flex-1 items-center justify-center rounded-control bg-senal-400 px-6 text-subtitulo font-semibold text-asfalto-900 hover:bg-senal-500">Registrar cliente nuevo</Link>
              <Boton variante="primario" tamano="xl" className="flex-1" onClick={() => setCasual(true)}>Visitante diario</Boton>
            </div>
          }
        />
      )}
      {noRegistrada && casual && <FormularioVisitante placa={buscada} alTerminar={terminar} alCancelar={() => setCasual(false)} />}
      {error && !noRegistrada && (
        <EstadoError
          mensaje={error instanceof ErrorApi && error.codigo === 'validacion' ? MENSAJE_FORMATO : 'No pudimos consultar la placa.'}
          alReintentar={() => void consulta.refetch()}
        />
      )}
    </section>
  );
}
