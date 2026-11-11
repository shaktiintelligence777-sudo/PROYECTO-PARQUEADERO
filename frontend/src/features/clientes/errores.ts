import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ErrorApi } from '@/api';
import { MENSAJES } from './esquemas';

/**
 * Lleva un error de la API al campo que corresponde (pantallas.md 0.3 y P5).
 * Devuelve el mensaje para un toast cuando el error no es de un campo.
 */
export function errorACampos<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, primeraPlaca?: Path<T>): string | null {
  if (!(err instanceof ErrorApi)) return 'No pudimos guardar los cambios. Inténtalo de nuevo.';
  const poner = (campo: string, message: string, enfocar: boolean) => setError(campo as Path<T>, { type: 'servidor', message }, { shouldFocus: enfocar });
  if (err.codigo === 'validacion' && err.detalles?.length) {
    err.detalles.forEach((d, i) => poner(d.campo, d.mensaje, i === 0));
    return null;
  }
  if (err.codigo === 'documento_duplicado') { poner('documento', MENSAJES.documentoDuplicado, true); return null; }
  if (err.codigo === 'placa_duplicada') {
    const campos = (err.detalles ?? []).map((d) => d.campo).filter((c) => /placa$/.test(c));
    if (campos.length === 0 && primeraPlaca) campos.push(primeraPlaca);
    if (campos.length === 0) return err.mensaje;
    campos.forEach((c, i) => poner(c, MENSAJES.placaDuplicada, i === 0));
    return null;
  }
  return err.mensaje;
}
