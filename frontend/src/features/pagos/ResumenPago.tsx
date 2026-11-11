import type { PagoVistaPrevia } from '@/api';
import { formatoFecha } from '@/lib/formato';
import { Esqueleto, Tarjeta } from '@/ui';

/** Resumen del pago: muestra lo que devuelve `previsualizarPago`; la pantalla no calcula fechas. */
export function ResumenPago({ vista, cargando }: { vista?: PagoVistaPrevia; cargando: boolean }) {
  return (
    <Tarjeta aria-label="Resumen" className="space-y-1 bg-asfalto-50">
      <h2 className="text-subtitulo text-asfalto-900">Resumen</h2>
      {cargando || !vista ? (
        <div className="space-y-2" aria-busy="true"><Esqueleto className="h-5 w-2/3" /><Esqueleto className="h-5 w-1/2" /><Esqueleto className="h-5 w-1/2" /></div>
      ) : (
        <dl className="space-y-1 text-cuerpo">
          <div className="flex justify-between gap-2"><dt className="text-asfalto-500">Cubre</dt><dd>{formatoFecha(vista.periodo_desde)} – {formatoFecha(vista.periodo_hasta)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-asfalto-500">Vencimiento actual</dt><dd>{formatoFecha(vista.vencimiento_actual)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-asfalto-500">Nuevo vencimiento</dt><dd className="font-semibold">{formatoFecha(vista.vencimiento_nuevo)}</dd></div>
        </dl>
      )}
    </Tarjeta>
  );
}
