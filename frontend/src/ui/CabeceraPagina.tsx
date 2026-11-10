import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { BotonIcono } from './BotonIcono';

export function CabeceraPagina({ titulo, alVolver, accion }: { titulo: string; alVolver?: () => void; accion?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {alVolver && <BotonIcono aria-label="Volver" onClick={alVolver} className="-ml-2"><ArrowLeft aria-hidden="true" className="size-6" /></BotonIcono>}
      <h1 className="min-w-0 flex-1 truncate text-titulo text-asfalto-900">{titulo}</h1>
      {accion && <div className="shrink-0">{accion}</div>}
    </header>
  );
}
