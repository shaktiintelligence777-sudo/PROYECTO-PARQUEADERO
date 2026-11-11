import { useState } from 'react';
import { ErrorApi, type Pago } from '@/api';
import { useAnularPago } from '@/api/hooks';
import { useSesion } from '@/features/auth/ProveedorSesion';
import { METODOS } from '@/features/membresias/esquemas';
import { formatoDinero, formatoFecha, formatoFechaHora } from '@/lib/formato';
import { Boton, DatoEtiquetado, DialogoConfirmar, Hoja, Insignia, useToast } from '@/ui';

export const MENSAJE_NO_ANULABLE = 'Solo se puede anular el último pago de una membresía.';

export function HojaDetallePago({ pago, alCerrar }: { pago: Pago | null; alCerrar: () => void }) {
  const esAdmin = useSesion().usuario?.rol === 'admin';
  const { mostrar } = useToast();
  const anular = useAnularPago();
  const [anulando, setAnulando] = useState(false);

  async function confirmar(motivo?: string) {
    if (!pago || !motivo) return;
    try {
      await anular.mutateAsync({ id: pago.id, datos: { motivo } });
      setAnulando(false);
      alCerrar();
    } catch (err) {
      setAnulando(false);
      mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi && err.codigo === 'pago_no_anulable' ? MENSAJE_NO_ANULABLE : err instanceof ErrorApi ? err.mensaje : 'No pudimos anular el pago. Inténtalo de nuevo.' });
    }
  }

  return (
    <>
      <Hoja
        abierta={pago !== null}
        alCerrar={alCerrar}
        titulo="Detalle del pago"
        pie={pago && esAdmin && !pago.anulado ? <Boton variante="peligro" onClick={() => setAnulando(true)}>Anular pago</Boton> : undefined}
      >
        {pago && (
          <div className="space-y-3">
            <DatoEtiquetado etiqueta="Cliente">{pago.cliente.nombre}</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Monto"><span className={pago.anulado ? "line-through" : undefined}>{formatoDinero(pago.monto)}</span></DatoEtiquetado>
            {pago.anulado && <Insignia tono="neutro">Anulado</Insignia>}
            <DatoEtiquetado etiqueta="Método">{METODOS.find((m) => m.valor === pago.metodo)?.etiqueta ?? pago.metodo}</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Plan">{`${pago.plan.nombre} · ${pago.periodos} ${pago.periodos === 1 ? 'periodo' : 'periodos'}`}</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Cubre">{`${formatoFecha(pago.periodo_desde)} – ${formatoFecha(pago.periodo_hasta)}`}</DatoEtiquetado>
            <DatoEtiquetado etiqueta="Registrado">{`${formatoFechaHora(pago.creado_en)} · ${pago.registrado_por.nombre}`}</DatoEtiquetado>
            {pago.nota && <DatoEtiquetado etiqueta="Nota">{pago.nota}</DatoEtiquetado>}
            {pago.anulado && pago.motivo_anulacion && <DatoEtiquetado etiqueta="Motivo de la anulación">{pago.motivo_anulacion}</DatoEtiquetado>}
          </div>
        )}
      </Hoja>
      {pago && (
        <DialogoConfirmar
          abierta={anulando}
          titulo={`¿Anular este pago de ${formatoDinero(pago.monto)}?`}
          texto="La fecha de vencimiento volverá a la que tenía la membresía antes de este pago."
          textoConfirmar="Anular pago"
          varianteConfirmar="peligro"
          pedirMotivo
          cargando={anular.isPending}
          alConfirmar={(motivo) => void confirmar(motivo)}
          alCancelar={() => setAnulando(false)}
        />
      )}
    </>
  );
}
