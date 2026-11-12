import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorApi } from '@/api';
import { useRegistrarEntradaCasual } from '@/api/hooks';
import { Boton, Campo, Entrada, Placa, Tarjeta, useToast } from '@/ui';

export interface FormularioVisitanteProps {
  placa: string;
  alTerminar: () => void;
  alCancelar: () => void;
}

/** Entrada de un visitante diario (cliente por día): solo placa, marca y color; el nombre es opcional. */
export function FormularioVisitante({ placa, alTerminar, alCancelar }: FormularioVisitanteProps) {
  const { mostrar } = useToast();
  const entrada = useRegistrarEntradaCasual();
  const [marca, setMarca] = useState('');
  const [color, setColor] = useState('');
  const [nombre, setNombre] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const ref = useRef<HTMLInputElement>(null);
  const enCurso = useRef(false);

  useEffect(() => { ref.current?.focus(); }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enCurso.current) return; // un doble toque no envía dos peticiones
    const nuevos: Record<string, string> = {};
    if (!marca.trim()) nuevos.marca = 'Escribe la marca.';
    if (!color.trim()) nuevos.color = 'Escribe el color.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    enCurso.current = true;
    try {
      await entrada.mutateAsync({ placa, marca: marca.trim(), color: color.trim(), ...(nombre.trim() ? { nombre: nombre.trim() } : {}) });
      mostrar({ tono: 'exito', mensaje: `Entrada registrada · ${placa} · Visitante diario` });
      alTerminar();
    } catch (err) {
      mostrar({ tono: 'peligro', mensaje: err instanceof ErrorApi ? err.mensaje : 'No pudimos registrar el acceso. Inténtalo de nuevo.' });
    } finally {
      enCurso.current = false;
    }
  }

  return (
    <Tarjeta aria-label="Visitante diario" className="space-y-3">
      <div className="flex items-center gap-3">
        <Placa placa={placa} tamano="lg" />
        <span className="text-subtitulo text-asfalto-900">Visitante diario</span>
      </div>
      <form onSubmit={(e) => void enviar(e)} className="space-y-3" noValidate>
        <Campo etiqueta="Marca" error={errores.marca}>
          <Entrada ref={ref} value={marca} maxLength={40} onChange={(e) => setMarca(e.target.value)} />
        </Campo>
        <Campo etiqueta="Color" error={errores.color}>
          <Entrada value={color} maxLength={40} onChange={(e) => setColor(e.target.value)} />
        </Campo>
        <Campo etiqueta="Nombre (opcional)">
          <Entrada value={nombre} maxLength={120} autoComplete="off" onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Boton type="submit" variante="exito" tamano="xl" anchoCompleto cargando={entrada.isPending}>Registrar entrada</Boton>
        <Boton variante="fantasma" anchoCompleto onClick={alCancelar}>Cancelar</Boton>
      </form>
    </Tarjeta>
  );
}
