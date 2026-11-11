import { describe, expect, it } from 'vitest';
import { esquemaPago } from './esquemas';

const base = { periodos: 1, monto: 60000, metodo: 'efectivo' as const, nota: '' };
const mensajes = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe('esquemaPago', () => {
  it('acepta el monto sugerido sin nota', () => {
    expect(esquemaPago(60000).safeParse(base).success).toBe(true);
  });
  it('CA-6 un monto distinto exige nota con el mensaje del sugerido', () => {
    const r = esquemaPago(60000).safeParse({ ...base, monto: 50000 });
    expect(mensajes(r)[0]).toMatch(/^Explica por qué el monto es distinto al sugerido \(\$60\.000\)\.$/);
    expect(esquemaPago(60000).safeParse({ ...base, monto: 50000, nota: 'Descuento' }).success).toBe(true);
  });
  it('limita los periodos de 1 a 12', () => {
    expect(esquemaPago(60000).safeParse({ ...base, periodos: 0 }).success).toBe(false);
    expect(esquemaPago(60000).safeParse({ ...base, periodos: 13 }).success).toBe(false);
    expect(esquemaPago(60000).safeParse({ ...base, periodos: 12 }).success).toBe(true);
  });
  it('rechaza un monto vacío', () => {
    expect(esquemaPago(60000).safeParse({ ...base, monto: null }).success).toBe(false);
  });
});
