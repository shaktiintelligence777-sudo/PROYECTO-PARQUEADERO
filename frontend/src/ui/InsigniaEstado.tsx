import { Ban, CheckCircle2, Clock, MinusCircle, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EstadoMembresia } from '@/api';
import { formatoDiasRestantes } from '@/lib/formato';
import { Insignia } from './Insignia';
import type { Tono } from './cx';

// Única fuente del color y la etiqueta de un estado de membresía (design-system §2.1).
const MAPA: Record<EstadoMembresia | 'sin_membresia', { tono: Tono; etiqueta: string; icono: ReactNode }> = {
  activa: { tono: 'exito', etiqueta: 'Activa', icono: <CheckCircle2 aria-hidden="true" className="size-3.5" /> },
  por_vencer: { tono: 'aviso', etiqueta: 'Por vencer', icono: <Clock aria-hidden="true" className="size-3.5" /> },
  vencida: { tono: 'peligro', etiqueta: 'Vencida', icono: <XCircle aria-hidden="true" className="size-3.5" /> },
  cancelada: { tono: 'neutro', etiqueta: 'Cancelada', icono: <Ban aria-hidden="true" className="size-3.5" /> },
  sin_membresia: { tono: 'neutro', etiqueta: 'Sin membresía', icono: <MinusCircle aria-hidden="true" className="size-3.5" /> },
};

export function InsigniaEstado({ estado, diasRestantes, className }: { estado: EstadoMembresia | null; diasRestantes?: number; className?: string }) {
  const { tono, etiqueta, icono } = MAPA[estado ?? 'sin_membresia'];
  return (
    <Insignia tono={tono} icono={icono} className={className}>
      {etiqueta}
      {diasRestantes !== undefined && estado !== null && <span className="normal-case">· {formatoDiasRestantes(diasRestantes)}</span>}
    </Insignia>
  );
}
