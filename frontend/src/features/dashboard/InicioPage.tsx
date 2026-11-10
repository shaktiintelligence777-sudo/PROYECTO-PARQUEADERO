import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// Resumen provisional; el Dashboard completo (P2) llega en A-08.
export function InicioPage() {
  const { data } = useQuery({ queryKey: ['resumen'], queryFn: () => api.resumen() });
  const items = [
    ['Motos dentro', data?.motos_dentro],
    ['Membresías por vencer', data?.membresias_por_vencer],
    ['Pagos de hoy', data?.pagos_hoy],
    ['Recaudo de hoy', data ? cop.format(data.total_hoy) : undefined],
  ] as const;
  return (
    <section>
      <h1 className="mb-4 text-xl font-semibold">Resumen</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-2xl font-semibold">{value ?? '…'}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
