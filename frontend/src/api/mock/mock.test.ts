import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../client';
import { createMockApi } from './index';
import { DEMO_EMAIL, DEMO_PASSWORD } from './seed';

const NOW = new Date('2026-11-10T12:00:00Z');
let api: ReturnType<typeof createMockApi>;
beforeEach(async () => {
  localStorage.clear();
  api = createMockApi({ storage: localStorage, now: () => NOW, latencyMs: 0 });
  await api.login(DEMO_EMAIL, DEMO_PASSWORD);
});

describe('mock API', () => {
  it('rechaza credenciales inválidas', async () => {
    await expect(api.login(DEMO_EMAIL, 'mala')).rejects.toBeInstanceOf(ApiError);
  });
  it('exige sesión', async () => {
    await api.logout();
    await expect(api.listClientes()).rejects.toMatchObject({ status: 401 });
  });
  it('persiste datos en storage', async () => {
    await api.crearCliente({ nombre: 'Nuevo', documento: '999', telefono: '1', email: 'n@e.com' });
    const otra = createMockApi({ storage: localStorage, now: () => NOW, latencyMs: 0 });
    expect((await otra.listClientes('999')).length).toBe(1);
  });
  it('no permite documento ni placa duplicados', async () => {
    const [c] = await api.listClientes();
    await expect(api.crearCliente({ nombre: 'X', documento: c.documento, telefono: '', email: '' })).rejects.toMatchObject({ status: 409 });
    await expect(api.crearMoto({ cliente_id: c.id, placa: 'abc12d', marca: '', color: '' })).rejects.toMatchObject({ status: 409 });
  });
  it('solo una estancia abierta por moto', async () => {
    await expect(api.registrarEntrada('abc12d')).rejects.toMatchObject({ status: 409 }); // ya está dentro (semilla)
    await api.registrarSalida('ABC12D');
    await api.registrarEntrada('ABC12D');
    await expect(api.registrarEntrada('ABC12D')).rejects.toMatchObject({ status: 409 });
  });
  it('salida sin entrada falla', async () => {
    await expect(api.registrarSalida('XYZ34E')).rejects.toMatchObject({ status: 409 });
  });
  it('calcula estados de membresía', async () => {
    const ms = await api.listMembresias();
    expect(ms.map((m) => m.estado)).toEqual(['activa', 'por_vencer', 'vencida', 'activa', 'por_vencer', 'activa']);
  });
  it('un pago extiende el vencimiento (desde hoy si estaba vencida)', async () => {
    const vencida = (await api.listMembresias({ estado: 'vencida' }))[0];
    const { membresia } = await api.registrarPago({ membresia_id: vencida.id, monto: 60000, metodo: 'efectivo' });
    expect(membresia.estado).toBe('activa');
    expect(membresia.fecha_vencimiento > '2026-11-10').toBe(true);
  });
  it('rechaza monto no positivo', async () => {
    await expect(api.registrarPago({ membresia_id: 'mem-1', monto: 0, metodo: 'otro' })).rejects.toMatchObject({ status: 422 });
  });
});
