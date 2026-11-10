import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorApi, obtenerApi } from '@/api';
import { Boton, Hoja, Aviso } from '@/ui';
import { CampoPassword } from './CampoPassword';

export interface HojaCambiarPasswordProps {
  abierta: boolean;
  alCerrar: () => void;
  /** Tras cambiarla se cierra la sesión: todas las sesiones quedan revocadas (RN-72). */
  alCambiar: () => void;
}

export function HojaCambiarPassword({ abierta, alCerrar, alCambiar }: HojaCambiarPasswordProps) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repite, setRepite] = useState('');
  const [errores, setErrores] = useState<{ actual?: string; nueva?: string; repite?: string }>({});
  const [errorApi, setErrorApi] = useState('');
  const [enviando, setEnviando] = useState(false);
  const refActual = useRef<HTMLInputElement>(null);

  useEffect(() => { if (abierta) { setActual(''); setNueva(''); setRepite(''); setErrores({}); setErrorApi(''); } }, [abierta]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const n: typeof errores = {};
    if (!actual) n.actual = 'Escribe tu contraseña actual.';
    if (nueva.length < 8) n.nueva = 'La contraseña nueva debe tener al menos 8 caracteres.';
    else if (nueva.length > 128) n.nueva = 'La contraseña nueva admite máximo 128 caracteres.';
    if (repite !== nueva) n.repite = 'Las contraseñas no coinciden.';
    setErrores(n);
    setErrorApi('');
    if (Object.keys(n).length) return;

    setEnviando(true);
    try {
      await obtenerApi().cambiarPassword({ password_actual: actual, password_nueva: nueva });
      setActual(''); setNueva(''); setRepite('');
      alCambiar();
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'password_incorrecta') {
        setErrores({ actual: 'La contraseña actual no es correcta.' });
        refActual.current?.focus();
      } else {
        setErrorApi(err instanceof ErrorApi ? err.mensaje : 'No pudimos cambiar la contraseña. Inténtalo de nuevo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Cambiar contraseña">
      <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-4">
        <CampoPassword ref={refActual} etiqueta="Contraseña actual" autoComplete="current-password" value={actual} onChange={setActual} error={errores.actual} />
        <CampoPassword etiqueta="Contraseña nueva" autoComplete="new-password" value={nueva} onChange={setNueva} error={errores.nueva} />
        <CampoPassword etiqueta="Repite la contraseña nueva" autoComplete="new-password" value={repite} onChange={setRepite} error={errores.repite} />
        {errorApi && <Aviso tono="peligro">{errorApi}</Aviso>}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>Cambiar contraseña</Boton>
        </div>
      </form>
    </Hoja>
  );
}
