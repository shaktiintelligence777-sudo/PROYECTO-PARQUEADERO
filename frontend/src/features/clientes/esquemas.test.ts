import { describe, expect, it } from 'vitest';
import { aClienteCrear, esquemaClienteAlta, esquemaClienteEdicion, esquemaMoto, MENSAJES } from './esquemas';

const valido = { nombre: 'Ana Ruiz', apellidos: '', telefono: '300 000 0001', email: '', notas: '', motos: [] };
const mensajes = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe('esquemas de cliente y moto', () => {
  it('CA-5 el alta vacía solo exige el nombre y la placa', () => {
    const r = esquemaClienteAlta.safeParse({ nombre: '', apellidos: '', telefono: '', email: '', notas: '', motos: [{ placa: '', marca: '', color: '' }] });
    expect(mensajes(r)).toEqual(expect.arrayContaining([MENSAJES.nombre, MENSAJES.placa]));
    expect(mensajes(r)).not.toContain(MENSAJES.telefono);
  });

  it('CA-10 el alta sin teléfono ni apellido es válida y envía teléfono vacío', () => {
    const r = esquemaClienteAlta.safeParse({ ...valido, telefono: '', apellidos: '' });
    expect(r.success).toBe(true);
    expect(aClienteCrear(r.data!).telefono).toBe('');
  });

  it('CA-11 el alta junta nombre y apellido en `nombre`, limpia el teléfono y las placas', () => {
    const r = esquemaClienteAlta.safeParse({ ...valido, apellidos: 'Pérez', motos: [{ placa: 'abc-12d', marca: ' Honda ', color: '' }] });
    expect(r.success).toBe(true);
    expect(aClienteCrear(r.data!)).toEqual({
      nombre: 'Ana Ruiz Pérez', documento: expect.stringMatching(/^[A-Z0-9]{12}$/), telefono: '3000000001', email: null, notas: null,
      motos: [{ placa: 'ABC12D', marca: 'Honda', color: null }],
    });
  });

  it('CA-12 nombre y apellido juntos no pueden superar 120 caracteres', () => {
    const r = esquemaClienteAlta.safeParse({ ...valido, nombre: 'A'.repeat(100), apellidos: 'B'.repeat(30) });
    expect(r.success).toBe(false);
  });

  it.each([
    ['teléfono corto', { telefono: '123456' }, MENSAJES.telefono],
    ['teléfono con letras', { telefono: '300abc0001' }, MENSAJES.telefono],
    ['email', { email: 'sin-arroba' }, MENSAJES.email],
  ])('rechaza %s', (_n, parcial, mensaje) => {
    expect(mensajes(esquemaClienteEdicion.safeParse({ ...valido, ...parcial }))).toContain(mensaje);
  });

  it('acepta teléfono con + inicial y email correcto', () => {
    expect(esquemaClienteEdicion.safeParse({ ...valido, telefono: '+573000000001', email: 'ana@correo.co' }).success).toBe(true);
  });

  it('limita a 5 motos y respeta los largos de marca y color', () => {
    const moto = { placa: 'ABC12D', marca: '', color: '' };
    expect(esquemaClienteAlta.safeParse({ ...valido, motos: Array(6).fill(moto) }).success).toBe(false);
    expect(esquemaMoto.safeParse({ ...moto, marca: 'x'.repeat(41) }).success).toBe(false);
    expect(esquemaMoto.safeParse({ ...moto, color: 'x'.repeat(31) }).success).toBe(false);
  });

  it('la placa de 3 o de 8 caracteres es inválida', () => {
    expect(esquemaMoto.safeParse({ placa: 'AB1', marca: '', color: '' }).success).toBe(false);
    expect(esquemaMoto.safeParse({ placa: 'ABCD1234', marca: '', color: '' }).success).toBe(false);
  });
});
