import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BotonIcono } from './BotonIcono';
import { TONO_SUAVE, cx, type Tono } from './cx';

export interface ToastDatos { tono?: Tono; titulo?: string; mensaje: string }
interface ToastActivo extends ToastDatos { id: number }
interface ContextoToast { mostrar: (t: ToastDatos) => void }

const Ctx = createContext<ContextoToast | null>(null);
const DURACION_MS = 4000;
const DURACION_ERROR_MS = 6000;

export function ProveedorToasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastActivo[]>([]);
  const siguiente = useRef(1);
  const temporizadores = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const quitar = useCallback((id: number) => {
    const t = temporizadores.current.get(id);
    if (t) clearTimeout(t);
    temporizadores.current.delete(id);
    setToasts((lista) => lista.filter((x) => x.id !== id));
  }, []);

  const mostrar = useCallback((datos: ToastDatos) => {
    const id = siguiente.current++;
    setToasts((lista) => [...lista, { ...datos, id }]);
    temporizadores.current.set(id, setTimeout(() => quitar(id), datos.tono === 'peligro' ? DURACION_ERROR_MS : DURACION_MS));
  }, [quitar]);

  useEffect(() => { const mapa = temporizadores.current; return () => mapa.forEach(clearTimeout); }, []);
  const valor = useMemo(() => ({ mostrar }), [mostrar]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-2 md:inset-x-auto md:bottom-4 md:right-4 md:top-auto md:w-96">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tono === 'peligro' ? 'alert' : 'status'}
            className={cx('pointer-events-auto flex items-start gap-2 rounded-tarjeta p-4 shadow-flotante', TONO_SUAVE[t.tono ?? 'neutro'])}
          >
            <div className="min-w-0 flex-1">
              {t.titulo && <p className="text-cuerpo font-semibold">{t.titulo}</p>}
              <p className="text-apoyo">{t.mensaje}</p>
            </div>
            <BotonIcono aria-label="Cerrar aviso" onClick={() => quitar(t.id)} className="-m-2"><X aria-hidden="true" className="size-5" /></BotonIcono>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ContextoToast {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast debe usarse dentro de ProveedorToasts');
  return c;
}
