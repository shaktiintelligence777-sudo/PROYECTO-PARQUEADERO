import { useState, type FormEvent } from 'react';
import { ErrorApi } from '@/api';
import { useCrearMembresia, usePlanes } from '@/api/hooks';
import { formatoDinero, formatoFecha } from '@/lib/formato';
import { hoyBogota, sumarDias } from '@/lib/fechas';
import { AreaTexto, Aviso, Boton, Campo, Entrada, EntradaDinero, GrupoOpciones, Hoja, Selector, useToast } from '@/ui';
import { esquemaCrearMembresia, MAX_NOTA, MENSAJES, METODOS, ultimoDiaCubierto, type MetodoPago } from './esquemas';

export interface HojaCrearMembresiaProps {
  abierta: boolean;
  alCerrar: () => void;
  cliente: { id: string; nombre: string };
}

type Errores = Partial<Record<'plan_id' | 'fecha_inicio' | 'monto' | 'nota', string>>;
const ID_FORM = 'form-crear-membresia';

export function HojaCrearMembresia({ abierta, alCerrar, cliente }: HojaCrearMembresiaProps) {
  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo={`Crear membresía · ${cliente.nombre}`}>
      <Formulario cliente={cliente} alCerrar={alCerrar} />
    </Hoja>
  );
}

function Formulario({ cliente, alCerrar }: { cliente: { id: string }; alCerrar: () => void }) {
  const { mostrar } = useToast();
  const planes = usePlanes({ activo: true });
  const crear = useCrearMembresia();
  const hoy = hoyBogota();
  const [planId, setPlanId] = useState('');
  const [inicio, setInicio] = useState(hoy);
  const [monto, setMonto] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState('');

  const plan = planes.data?.items.find((p) => p.id === planId);
  const distinto = plan !== undefined && monto !== plan.precio;

  function elegirPlan(id: string) {
    setPlanId(id);
    const p = planes.data?.items.find((x) => x.id === id);
    setMonto(p ? p.precio : null); // al elegir plan, el monto se rellena con el precio
    setErrores((e) => ({ ...e, plan_id: undefined }));
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    setErrorGeneral('');
    const r = esquemaCrearMembresia(plan?.precio ?? 0).safeParse({ plan_id: planId, fecha_inicio: inicio, monto, metodo, nota });
    if (!r.success) {
      const nuevos: Errores = {};
      r.error.issues.forEach((i) => { const k = i.path[0] as keyof Errores; nuevos[k] ??= i.message; });
      setErrores(nuevos);
      return;
    }
    setErrores({});
    try {
      const m = await crear.mutateAsync({
        cliente_id: cliente.id, plan_id: r.data.plan_id, fecha_inicio: r.data.fecha_inicio,
        pago_inicial: { monto: r.data.monto, metodo: r.data.metodo, nota: r.data.nota || null },
      });
      mostrar({ tono: 'exito', mensaje: `Membresía creada. Vence el ${formatoFecha(m.fecha_vencimiento)}.` });
      alCerrar();
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'membresia_existente') setErrorGeneral(MENSAJES.membresiaExistente);
      else if (err instanceof ErrorApi && err.codigo === 'plan_inactivo') setErrorGeneral(MENSAJES.planInactivo);
      else if (err instanceof ErrorApi && err.codigo === 'validacion' && err.detalles?.length) {
        const nuevos: Errores = {};
        err.detalles.forEach((d) => {
          const k = d.campo.replace('pago_inicial.', '') as keyof Errores;
          nuevos[k] = d.mensaje;
        });
        setErrores(nuevos);
      } else mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos crear la membresía. Inténtalo de nuevo.' });
    }
  }

  return (
    <>
      <form id={ID_FORM} onSubmit={(e) => void enviar(e)} noValidate className="space-y-4">
        {errorGeneral && <Aviso tono="peligro">{errorGeneral}</Aviso>}
        <Campo etiqueta="Plan *" error={errores.plan_id}>
          <Selector value={planId} onChange={(e) => elegirPlan(e.target.value)}>
            <option value="">Elige un plan</option>
            {planes.data?.items.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} · {p.duracion_dias} días · {formatoDinero(p.precio)}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Fecha de inicio *" error={errores.fecha_inicio}>
          <Entrada type="date" value={inicio} min={sumarDias(hoy, -31)} max={sumarDias(hoy, 31)} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Campo etiqueta="Monto *" error={errores.monto}>
          <EntradaDinero value={monto} onChange={setMonto} />
        </Campo>
        <GrupoOpciones etiqueta="Método de pago *" valor={metodo} onChange={setMetodo} opciones={METODOS.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))} />
        <Campo etiqueta="Nota" error={errores.nota} ayuda={distinto && !errores.nota ? MENSAJES.notaCrear : undefined}>
          <AreaTexto maxLength={MAX_NOTA} value={nota} onChange={(e) => setNota(e.target.value)} />
        </Campo>
      </form>
      <div className="mt-4 border-t border-asfalto-200 pt-3">
        {plan && inicio && <p className="mb-3 text-cuerpo text-asfalto-700">Cubre del {formatoFecha(inicio)} al {formatoFecha(ultimoDiaCubierto(inicio, plan.duracion_dias))}</p>}
        <Boton type="submit" form={ID_FORM} tamano="lg" anchoCompleto cargando={crear.isPending}>Crear y registrar pago</Boton>
      </div>
    </>
  );
}
