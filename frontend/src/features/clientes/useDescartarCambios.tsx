import { useEffect, useState } from 'react';
import { DialogoConfirmar } from '@/ui';

/** Pide confirmar antes de abandonar un formulario con cambios sin guardar (regla 0.4 de pantallas.md). */
export function useDescartarCambios() {
  const [sucio, setSucio] = useState(false);
  const [pendiente, setPendiente] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sucio]);

  const intentarSalir = (accion: () => void) => {
    if (sucio) setPendiente(() => accion);
    else accion();
  };

  const dialogo = (
    <DialogoConfirmar
      abierta={pendiente !== null}
      titulo="¿Descartar los cambios?"
      textoConfirmar="Descartar"
      textoCancelar="Seguir editando"
      varianteConfirmar="peligro"
      alConfirmar={() => { const accion = pendiente; setPendiente(null); setSucio(false); accion?.(); }}
      alCancelar={() => setPendiente(null)}
    />
  );

  return { setSucio, intentarSalir, dialogo };
}
