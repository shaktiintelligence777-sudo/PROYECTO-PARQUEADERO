import { describe, expect, it } from 'vitest';
import { hoyBogota, sumarDias } from './fechas';

describe('fechas', () => {
  it('suma días cruzando mes y año', () => {
    expect(sumarDias('2026-11-10', 29)).toBe('2026-12-09');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('hoyBogota devuelve una fecha AAAA-MM-DD', () => {
    expect(hoyBogota()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
