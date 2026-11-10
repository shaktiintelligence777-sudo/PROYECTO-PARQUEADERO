import { useState } from 'react';
import { Boton } from './Boton';
import { DialogoConfirmar } from './DialogoConfirmar';

/** Franja fija arriba cuando la app corre con datos simulados. El texto es el de docs/ui/pantallas.md. */
export function BannerDemo({ alReiniciar }: { alReiniciar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 bg-info-suave px-4 py-1 text-center text-apoyo text-info-texto">
      <span>Modo demo: los datos son ficticios y se guardan solo en este navegador.</span>
      <Boton variante="fantasma" className="!h-11 !px-2 underline" onClick={() => setConfirmando(true)}>Reiniciar datos</Boton>
      <DialogoConfirmar
        abierta={confirmando}
        titulo="Reiniciar datos"
        texto="Se borrarán los cambios que hayas hecho en el demo."
        textoConfirmar="Reiniciar"
        textoCancelar="Cancelar"
        alCancelar={() => setConfirmando(false)}
        alConfirmar={() => { setConfirmando(false); alReiniciar(); }}
      />
    </div>
  );
}
