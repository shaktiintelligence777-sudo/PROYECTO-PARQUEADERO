import { describe, expect, it } from 'vitest';
import {
  formatoDiasRestantes, formatoDinero, formatoDuracion, formatoFecha, formatoFechaHora, formatoHora, normalizarPlaca,
} from './formato';

describe('formato', () => {
  it('CA-5 dinero', () => {
    expect(formatoDinero(60000)).toBe('$60.000');
    expect(formatoDinero(1234567)).toBe('$1.234.567');
    expect(formatoDinero(0)).toBe('$0');
  });
  it('fecha', () => expect(formatoFecha('2026-11-13')).toBe('13 nov 2026'));
  it('CA-6 fecha y hora en America/Bogota, sin depender de la zona de la máquina', () => {
    expect(process.env.TZ).toBe('UTC');
    expect(formatoFechaHora('2026-11-11T03:30:00Z')).toBe('10 nov, 10:30 p. m.');
    expect(formatoFechaHora('2026-11-10T21:05:00Z')).toBe('10 nov, 4:05 p. m.');
    expect(formatoHora('2026-11-10T14:00:00Z')).toBe('9:00 a. m.');
  });
  it('CA-7 días restantes', () => {
    expect([2, 1, 0, -1, -5].map(formatoDiasRestantes)).toEqual([
      'vence en 2 días', 'vence mañana', 'vence hoy', 'venció ayer', 'venció hace 5 días',
    ]);
  });
  it('CA-8 duración', () => {
    expect(formatoDuracion(135)).toBe('2 h 15 min');
    expect(formatoDuracion(45)).toBe('45 min');
    expect(formatoDuracion(1620)).toBe('1 d 3 h');
  });
  it('CA-9 placa', () => expect(normalizarPlaca('abc-12 d')).toBe('ABC12D'));
});
