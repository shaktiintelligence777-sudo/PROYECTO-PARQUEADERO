import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PagoRegistrado as Resultado } from '@/api';
import { formatoDinero, formatoFecha } from '@/lib/formato';
import { Boton } from '@/ui';
import { METODOS } from '@/features/membresias/esquemas';

/** Pantalla de confirmación tras registrar un pago (P7). */
export function PagoRegistrado({ resultado, alOtroPago }: { resultado: Resultado; alOtroPago: () => void }) {
  const { pago, membresia } = resultado;
  const metodo = METODOS.find((m) => m.valor === pago.metodo)?.etiqueta ?? pago.metodo;
  return (
    <section aria-label="Pago registrado" className="mx-auto flex max-w-hoja flex-col items-center gap-2 py-8 text-center">
      <CheckCircle2 aria-hidden="true" className="size-16 text-exito" />
      <h1 className="text-titulo text-asfalto-900">Pago registrado</h1>
      <p className="text-subtitulo">{formatoDinero(pago.monto)} · {metodo}</p>
      <p className="text-cuerpo text-asfalto-700">{pago.cliente.nombre}</p>
      <p className="text-cuerpo text-asfalto-700">Vence el {formatoFecha(membresia.fecha_vencimiento)}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
        <Boton tamano="lg" onClick={alOtroPago}>Registrar otro pago</Boton>
        <Link to={`/clientes/${pago.cliente.id}`} className="text-cuerpo text-info underline">Ver cliente</Link>
      </div>
    </section>
  );
}
