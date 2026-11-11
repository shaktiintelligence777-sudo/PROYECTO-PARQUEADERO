import { describe, expect, it } from 'vitest';
import { esquemaCrearMembresia, mensajeNotaPago, ultimoDiaCubierto } from './esquemas';

const base = { plan_id: 'p1', fecha_inicio: '2026-11-10', monto: 60000, metodo: 'efectivo' as const, nota: '' };
const mensajes = (r: { error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe('esquemas de membresía', () => {
  it('acepta el monto igual al precio sin nota', () => {
    expect(esquemaCrearMembresia(60000).safeParse(base).success).toBe(true);
  });
  it('exige nota si el monto difiere del precio del plan', () => {
    const r = esquemaCrearMembresia(60000).safeParse({ ...base, monto: 50000 });
    expect(mensajes(r)).toContain('Explica por qué el monto es distinto al del plan.');
    expect(esquemaCrearMembresia(60000).safeParse({ ...base, monto: 50000, nota: 'Descuento' }).success).toBe(true);
  });
  it('rechaza plan vacío y monto vacío', () => {
    const r = esquemaCrearMembresia(60000).safeParse({ ...base, plan_id: '', monto: null });
    expect(r.success).toBe(false);
  });
  it('mensajeNotaPago formatea el monto sugerido', () => {
    expect(mensajeNotaPago(60000)).toMatch(/^Explica por qué el monto es distinto al sugerido \(\$\s?60\.000\)\.$/);
  });
  it('ultimoDiaCubierto es inicio + duración − 1', () => {
    expect(ultimoDiaCubierto('2026-11-10', 30)).toBe('2026-12-09');
  });
});
