import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BotonIcono } from './BotonIcono';

export interface HojaProps {
  abierta: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
  pie?: ReactNode;
}

const FOCALIZABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Panel que sube desde abajo en móvil y es un diálogo centrado desde `md`. Atrapa el foco y bloquea el desplazamiento. */
export function Hoja({ abierta, alCerrar, titulo, children, pie }: HojaProps) {
  const idTitulo = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const disparador = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const primero = panel.current?.querySelector<HTMLElement>('[data-foco-inicial], input, textarea, select') ?? panel.current?.querySelector<HTMLElement>(FOCALIZABLES);
    (primero ?? panel.current)?.focus();
    return () => {
      document.body.style.overflow = overflowPrevio;
      disparador?.focus();
    };
  }, [abierta]);

  if (!abierta) return null;

  const teclado = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); alCerrar(); return; }
    if (e.key !== 'Tab' || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCALIZABLES)];
    if (items.length === 0) { e.preventDefault(); return; }
    const primero = items[0]!;
    const ultimo = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-asfalto-900/50 md:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar(); }}
      onKeyDown={teclado}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-tarjeta bg-blanco p-4 shadow-flotante md:max-w-hoja md:rounded-tarjeta"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={idTitulo} className="text-subtitulo text-asfalto-900">{titulo}</h2>
          <BotonIcono aria-label="Cerrar" onClick={alCerrar}><X aria-hidden="true" className="size-5" /></BotonIcono>
        </div>
        {children}
        {pie && <div className="mt-4 flex flex-wrap justify-end gap-2">{pie}</div>}
      </div>
    </div>,
    document.body,
  );
}
