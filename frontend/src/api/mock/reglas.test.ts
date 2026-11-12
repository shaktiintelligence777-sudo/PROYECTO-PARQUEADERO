import { describe, expect, it } from 'vitest';
import {
  advertenciasDeEstado, diasRestantes, inicioDeCiclo, estadoMembresia, normalizarPlaca, periodoDePago, plano, sumarDias, vencimientoInicial,
} from './reglas';

describe('reglas', () => {
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('estado de membresía, incluido el día exacto del vencimiento (RN-32)', () => {
    const e = (v: string, c: string | null = null) => estadoMembresia({ fecha_vencimiento: v, cancelada_en: c }, '2026-11-10', 3);
    expect(e('2026-11-09')).toBe('vencida');
    expect(e('2026-11-10')).toBe('por_vencer');
    expect(e('2026-11-13')).toBe('por_vencer');
    expect(e('2026-11-14')).toBe('activa');
    expect(e('2026-12-30', '2026-11-01T00:00:00Z')).toBe('cancelada');
    expect(diasRestantes('2026-11-08', '2026-11-10')).toBe(-2);
  });
  const m = (inicio: string, venc: string) => ({ fecha_inicio: inicio, fecha_vencimiento: venc });
  it('CB-2 pago anticipado no pierde días: el periodo empieza al día siguiente del vencimiento', () => {
    expect(periodoDePago(m('2026-10-13', '2026-11-12'), 30, 1)).toEqual({ periodo_desde: '2026-11-13', periodo_hasta: '2026-12-12' });
  });
  it('CB-3 pago tardío renueva desde el vencimiento anterior, no desde el día del pago (5 nov → 5 dic)', () => {
    expect(periodoDePago(m('2026-10-06', '2026-11-05'), 30, 1)).toEqual({ periodo_desde: '2026-11-06', periodo_hasta: '2026-12-05' });
  });
  it('CB-4 tres periodos mensuales avanzan tres meses de calendario', () => {
    expect(periodoDePago(m('2026-10-13', '2026-11-12'), 30, 3).periodo_hasta).toBe('2027-02-12');
  });
  it('el ciclo conserva el día del mes aunque un mes corto lo recorte (inicio 31 ene)', () => {
    const feb = periodoDePago(m('2026-01-31', '2026-02-27'), 30, 1);
    expect(feb).toEqual({ periodo_desde: '2026-02-28', periodo_hasta: '2026-03-30' });
    expect(periodoDePago(m('2026-01-31', feb.periodo_hasta), 30, 1).periodo_hasta).toBe('2026-04-29');
  });
  it('un plan que no es múltiplo de 30 días avanza por días', () => {
    expect(periodoDePago(m('2026-11-04', '2026-11-10'), 7, 1)).toEqual({ periodo_desde: '2026-11-11', periodo_hasta: '2026-11-17' });
  });
  it('vencimiento inicial (RN-31) e inverso', () => {
    expect(vencimientoInicial('2026-11-10', 30)).toBe('2026-12-09');
    expect(vencimientoInicial('2027-01-31', 30)).toBe('2027-02-27');
    expect(inicioDeCiclo('2026-12-09', 30)).toBe('2026-11-10');
    expect(vencimientoInicial('2026-11-10', 7)).toBe('2026-11-16');
  });
  it('advertencias (RN-52, CB-10)', () => {
    expect(advertenciasDeEstado(null)).toEqual(['sin_membresia']);
    expect(advertenciasDeEstado('cancelada')).toEqual(['sin_membresia']);
    expect(advertenciasDeEstado('vencida')).toEqual(['membresia_vencida']);
    expect(advertenciasDeEstado('por_vencer')).toEqual(['membresia_por_vencer']);
    expect(advertenciasDeEstado('activa')).toEqual([]);
  });
  it('placa y búsqueda sin tildes', () => {
    expect(normalizarPlaca('abc-12d')).toBe('ABC12D');
    expect(plano('José')).toBe('jose');
  });
});
