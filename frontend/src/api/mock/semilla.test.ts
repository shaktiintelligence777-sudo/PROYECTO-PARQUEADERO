import { describe, expect, it } from 'vitest';
import { estadoMembresia, sumarDias } from './reglas';
import { relojFijo } from './reloj';
import { crearSemilla } from './semilla';

const reloj = relojFijo('2026-11-10T17:00:00Z');
const db = crearSemilla(reloj);
const hoy = reloj.hoy();

describe('semilla (docs/dominio.md §6)', () => {
  it('cubre los cuatro estados y los clientes sin membresía', () => {
    const cuenta: Record<string, number> = {};
    for (const c of db.clientes) {
      const m = db.membresias.find((x) => x.cliente_id === c.id);
      const e = m ? estadoMembresia(m, hoy, 3) : 'sin';
      cuenta[e] = (cuenta[e] ?? 0) + 1;
    }
    expect(cuenta).toEqual({ activa: 6, por_vencer: 2, vencida: 2, cancelada: 1, sin: 1 });
  });
  it('tiene 12 clientes, 2 con dos motos y 1 sin email', () => {
    expect(db.clientes).toHaveLength(12);
    expect(db.clientes.filter((c) => db.motos.filter((m) => m.cliente_id === c.id).length === 2)).toHaveLength(2);
    expect(db.clientes.filter((c) => !c.email)).toHaveLength(1);
  });
  it('tiene al menos 5 motos dentro (una con más de 24 h) y unas 30 estancias cerradas', () => {
    const dentro = db.estancias.filter((e) => !e.salida_en);
    expect(dentro.length).toBeGreaterThanOrEqual(5);
    expect(dentro.some((e) => reloj.ahora().getTime() - new Date(e.entrada_en).getTime() > 24 * 3600_000)).toBe(true);
    expect(db.estancias.filter((e) => e.salida_en)).toHaveLength(30);
  });
  it('ninguna moto tiene estancias solapadas', () => {
    for (const m of db.motos) {
      const es = db.estancias.filter((e) => e.moto_id === m.id).sort((a, b) => a.entrada_en.localeCompare(b.entrada_en));
      es.forEach((e, i) => { if (i > 0) expect(es[i - 1]!.salida_en! <= e.entrada_en).toBe(true); });
    }
  });
  it('tiene 2 pagos de hoy y 1 anulado, y los vencimientos son coherentes con los pagos vigentes', () => {
    const deHoy = db.pagos.filter((p) => !p.anulado && p.creado_en.slice(0, 10) === hoy);
    expect(deHoy).toHaveLength(2);
    expect(db.pagos.filter((p) => p.anulado)).toHaveLength(1);
    for (const m of db.membresias) {
      const ultimo = db.pagos.filter((p) => p.membresia_id === m.id && !p.anulado).at(-1)!;
      expect(ultimo.periodo_hasta).toBe(m.fecha_vencimiento);
    }
  });
  it('usa datos ficticios y fechas relativas a hoy', () => {
    expect(db.clientes.every((c) => c.documento.startsWith('900000') && (!c.email || c.email.endsWith('@example.com')))).toBe(true);
    expect(db.membresias.some((m) => m.fecha_vencimiento === sumarDias(hoy, 2))).toBe(true);
  });
});
