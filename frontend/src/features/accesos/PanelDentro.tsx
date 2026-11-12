import { useState } from 'react';
import { ErrorApi, esVisitanteCasual, type Estancia } from '@/api';
import { useMotosDentro, useRegistrarSalida } from '@/api/hooks';
import { formatoDuracion, formatoHora } from '@/lib/formato';
import { Boton, Buscador, Cronometro, DialogoConfirmar, Elemento, EstadoError, EstadoVacio, Esqueleto, Insignia, ListaElementos, Placa, useToast } from '@/ui';

const REFRESCO_MS = 30_000;
const MINUTOS_DIA = 24 * 60;

export function PanelDentro() {
  const { mostrar } = useToast();
  const [filtro, setFiltro] = useState('');
  const [aSacar, setASacar] = useState<Estancia | null>(null);
  const dentro = useMotosDentro(filtro ? { placa: filtro } : undefined, REFRESCO_MS);
  const salida = useRegistrarSalida();

  async function confirmar() {
    if (!aSacar) return;
    const placa = aSacar.moto.placa;
    try {
      const r = await salida.mutateAsync({ placa });
      mostrar({ tono: 'exito', mensaje: `Salida registrada · ${placa} · ${formatoDuracion(r.estancia.duracion_minutos)}` });
    } catch (err) {
      mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos registrar la salida. Inténtalo de nuevo.' });
    }
    setASacar(null);
  }

  const datos = dentro.data;
  const titulo = datos
    ? datos.capacidad ? `${datos.total} de ${datos.capacidad} motos dentro` : `${datos.total} ${datos.total === 1 ? 'moto dentro' : 'motos dentro'}`
    : 'Motos dentro';

  return (
    <section aria-label="Dentro" className="space-y-4">
      <h2 className="text-subtitulo text-asfalto-900">{titulo}</h2>
      <Buscador etiqueta="Filtrar por placa" placeholder="Filtrar por placa" alBuscar={(t) => setFiltro(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())} />

      {dentro.isLoading && <Esqueleto className="h-40 w-full" />}
      {dentro.isError && <EstadoError mensaje="No pudimos cargar las motos dentro." alReintentar={() => void dentro.refetch()} />}
      {datos && datos.items.length === 0 && (
        <EstadoVacio titulo={filtro ? 'Ninguna moto dentro coincide con esa placa.' : 'No hay motos dentro en este momento.'} />
      )}
      {datos && datos.items.length > 0 && (
        <ListaElementos etiqueta="Motos dentro">
          {datos.items.map((e) => (
            <Elemento
              key={e.id}
              inicio={<Placa placa={e.moto.placa} />}
              titulo={e.cliente.nombre}
              subtitulo={<>Desde las {formatoHora(e.entrada_en)} · <Cronometro desde={e.entrada_en} /></>}
              fin={
                <span className="flex items-center gap-2">
                  {esVisitanteCasual(e) && <Insignia tono="info">Casual</Insignia>}
                  {e.duracion_minutos > MINUTOS_DIA && <Insignia tono="aviso">Más de 24 h</Insignia>}
                  <Boton variante="secundario" onClick={() => setASacar(e)}>Salida</Boton>
                </span>
              }
            />
          ))}
        </ListaElementos>
      )}

      <DialogoConfirmar
        abierta={aSacar !== null}
        titulo={`¿Registrar la salida de ${aSacar?.moto.placa ?? ''}?`}
        textoConfirmar="Registrar salida"
        cargando={salida.isPending}
        alConfirmar={() => void confirmar()}
        alCancelar={() => setASacar(null)}
      />
    </section>
  );
}
