import { describe, expect, it } from 'vitest';
import { aClienteCrear, esquemaClienteAlta, esquemaClienteEdicion, esquemaMoto, MENSAJES } from './esquemas';

const valido = { nombre: 'Ana Ruiz', documento: 'AB12345', telefono: '300 000 0001', email: '', notas: '', motos: [] };
const mensajes = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues.map((i) => i.message) ?? [];

describe('esquemas de cliente y moto', () => {
  it('CA-5 el alta vacía produce los mensajes de P5', () => {
    const r = esquemaClienteAlta.safeParse({ nombre: '', documento: '', telefono: '', email: '', notas: '', motos: [{ placa: '', marca: '', color: '' }] });
    expect(mensajes(r)).toEqual(expect.arrayContaining([MENSAJES.nombre, MENSAJES.documento, MENSAJES.telefono, MENSAJES.placa]));
  });

  it('acepta un alta válida y limpia el teléfono, el email vacío y las placas', () => {
    const r = esquemaClienteAlta.safeParse({ ...valido, motos: [{ placa: 'abc-12d', marca: ' Honda ', color: '' }] });
    expect(r.success).toBe(true);
    expect(aClienteCrear(r.data!)).toEqual({
      nombre: 'Ana Ruiz', documento: 'AB12345', telefono: '3000000001', email: null, notas: null,
      motos: [{ placa: 'ABC12D', marca: 'Honda', color: null }],
    });
  });

  it.each([
    ['documento', { documento: 'ab 123' }, MENSAJES.documento],
    ['documento largo', { documento: 'A'.repeat(21) }, MENSAJES.documento],
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
