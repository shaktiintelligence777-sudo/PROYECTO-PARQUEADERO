import { ErrorApi, type DetalleError } from '../client';

/** Acumula errores de campo y los lanza juntos como 422 `validacion`. */
export class Validador {
  readonly errores: DetalleError[] = [];

  falla(campo: string, mensaje: string): void { this.errores.push({ campo, mensaje }); }

  texto(campo: string, v: unknown, min: number, max: number, requerido = true): void {
    if (v === undefined || v === null || v === '') { if (requerido) this.falla(campo, 'Este dato es obligatorio.'); return; }
    if (typeof v !== 'string') return this.falla(campo, 'Debe ser texto.');
    const n = v.trim().length;
    if (n < min) this.falla(campo, `Debe tener al menos ${min} caracteres.`);
    else if (n > max) this.falla(campo, `Debe tener máximo ${max} caracteres.`);
  }

  patron(campo: string, v: unknown, re: RegExp, mensaje: string, requerido = true): void {
    if (v === undefined || v === null || v === '') { if (requerido) this.falla(campo, 'Este dato es obligatorio.'); return; }
    if (typeof v !== 'string' || !re.test(v)) this.falla(campo, mensaje);
  }

  email(campo: string, v: unknown, requerido = true): void {
    this.patron(campo, v, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Escribe un correo válido.', requerido);
    if (typeof v === 'string' && v.length > 254) this.falla(campo, 'El correo es demasiado largo.');
  }

  entero(campo: string, v: unknown, min: number, max: number, requerido = true): void {
    if (v === undefined || v === null) { if (requerido) this.falla(campo, 'Este dato es obligatorio.'); return; }
    if (typeof v !== 'number' || !Number.isInteger(v)) return this.falla(campo, 'Debe ser un número entero.');
    if (v < min || v > max) this.falla(campo, `Debe estar entre ${min} y ${max}.`);
  }

  enumerado(campo: string, v: unknown, valores: readonly string[], requerido = true): void {
    if (v === undefined || v === null) { if (requerido) this.falla(campo, 'Este dato es obligatorio.'); return; }
    if (typeof v !== 'string' || !valores.includes(v)) this.falla(campo, `Valor no permitido (${valores.join(', ')}).`);
  }

  fecha(campo: string, v: unknown, requerido = true): void {
    this.patron(campo, v, /^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD.', requerido);
  }

  /** Lanza si hubo errores. */
  verificar(): void {
    if (this.errores.length) throw new ErrorApi(422, 'validacion', 'Hay datos que corregir.', this.errores);
  }
}
