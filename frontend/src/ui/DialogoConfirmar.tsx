import { useEffect, useState } from 'react';
import { Boton } from './Boton';
import { Campo } from './Campo';
import { AreaTexto } from './Entrada';
import { Hoja } from './Hoja';

export interface DialogoConfirmarProps {
  abierta: boolean;
  titulo: string;
  texto?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  varianteConfirmar?: 'primario' | 'peligro';
  pedirMotivo?: boolean;
  cargando?: boolean;
  alConfirmar: (motivo?: string) => void;
  alCancelar: () => void;
}

const MIN_MOTIVO = 5;

export function DialogoConfirmar({
  abierta, titulo, texto, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', varianteConfirmar = 'primario',
  pedirMotivo = false, cargando = false, alConfirmar, alCancelar,
}: DialogoConfirmarProps) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (abierta) setMotivo(''); }, [abierta]);
  const faltaMotivo = pedirMotivo && motivo.trim().length < MIN_MOTIVO;

  return (
    <Hoja
      abierta={abierta}
      alCerrar={alCancelar}
      titulo={titulo}
      pie={
        <>
          <Boton variante="secundario" onClick={alCancelar}>{textoCancelar}</Boton>
          <Boton variante={varianteConfirmar} cargando={cargando} disabled={faltaMotivo} onClick={() => alConfirmar(pedirMotivo ? motivo.trim() : undefined)}>
            {textoConfirmar}
          </Boton>
        </>
      }
    >
      {texto && <p className="mb-3 text-cuerpo text-asfalto-700">{texto}</p>}
      {pedirMotivo && (
        <Campo etiqueta="Motivo" ayuda={`Mínimo ${MIN_MOTIVO} caracteres.`}>
          <AreaTexto value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />
        </Campo>
      )}
    </Hoja>
  );
}
