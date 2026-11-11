import { useState } from 'react';
import { ErrorApi, type Membresia, type MembresiaResumen } from '@/api';
import { useCambiarPlanMembresia, usePlanes } from '@/api/hooks';
import { formatoDinero } from '@/lib/formato';
import { Boton, Campo, Hoja, Selector, useToast } from '@/ui';
import { MENSAJES } from './esquemas';

export interface HojaCambiarPlanProps {
  abierta: boolean;
  alCerrar: () => void;
  membresia: Pick<Membresia | MembresiaResumen, 'id' | 'plan'>;
}

export function HojaCambiarPlan({ abierta, alCerrar, membresia }: HojaCambiarPlanProps) {
  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Cambiar plan">
      <Formulario membresia={membresia} alCerrar={alCerrar} />
    </Hoja>
  );
}

function Formulario({ membresia, alCerrar }: { membresia: HojaCambiarPlanProps['membresia']; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const planes = usePlanes({ activo: true });
  const cambiar = useCambiarPlanMembresia();
  const [planId, setPlanId] = useState(membresia.plan.id);
  const [error, setError] = useState('');

  async function confirmar() {
    if (!planId) { setError(MENSAJES.plan); return; }
    try {
      await cambiar.mutateAsync({ id: membresia.id, plan_id: planId });
      alCerrar();
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'plan_inactivo') setError(MENSAJES.planInactivo);
      else mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos cambiar el plan. Inténtalo de nuevo.' });
    }
  }

  return (
    <>
      <Campo etiqueta="Plan *" error={error || undefined} ayuda="El cambio aplica desde el próximo pago. La fecha de vencimiento actual no cambia.">
        <Selector value={planId} onChange={(e) => { setPlanId(e.target.value); setError(''); }}>
          {planes.data?.items.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre} · {p.duracion_dias} días · {formatoDinero(p.precio)}</option>
          ))}
        </Selector>
      </Campo>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
        <Boton cargando={cambiar.isPending} disabled={planId === membresia.plan.id} onClick={() => void confirmar()}>Cambiar plan</Boton>
      </div>
    </>
  );
}
