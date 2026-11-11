// @vitest-environment node
/**
 * C-01 · CA-11: recorrido completo del adaptador live contra un backend real con la semilla.
 * Solo corre si se define C01_API_URL (por ejemplo, http://localhost:8000 con `docker compose up`
 * y `python -m app.db.semilla --reiniciar`). Las pantallas usan exactamente estos métodos.
 */
import { describe, expect, it } from 'vitest';
import { conSesion } from '../conSesion';
import { LiveApi } from './LiveApi';

const URL_API = process.env.C01_API_URL;

function almacenEnMemoria() {
  let valor: string | null = null;
  return {
    leer: () => valor,
    guardar: (v: string) => { valor = v; },
    borrar: () => { valor = null; },
    notificarExpiracion: () => undefined,
  };
}

describe.skipIf(!URL_API)('C-01 · integración con el backend real', () => {
  it('CA-11 login, entrada, salida, alta de cliente, alta de membresía y pago', async () => {
    const base = new LiveApi(URL_API!);
    const almacen = almacenEnMemoria();
    const api = conSesion(base, almacen as never);

    const sesion = await api.login({ email: 'demo@parqueadero.app', password: 'demo1234' });
    base.establecerToken(sesion.access_token);
    almacen.guardar(sesion.refresh_token);
    expect((await api.usuarioActual()).email).toBe('demo@parqueadero.app');

    // Entrada y salida de una moto de la semilla.
    const placa = 'ABC12D';
    const consulta = await api.consultarPlaca('abc-12d');
    expect(consulta.moto.placa).toBe(placa);
    if (consulta.estancia_abierta) await api.registrarSalida({ placa });
    const entrada = await api.registrarEntrada({ placa });
    expect(entrada.estancia.salida_en).toBeNull();
    expect((await api.listarMotosDentro()).items.some((e) => e.moto.placa === 'ABC12D')).toBe(true);
    const salida = await api.registrarSalida({ placa });
    expect(salida.estancia.salida_en).not.toBeNull();

    // Alta de cliente con moto, membresía con pago inicial y un segundo pago.
    const sufijo = String(Date.now()).slice(-6);
    const cliente = await api.crearCliente({
      nombre: 'Cliente Integración', documento: `INT${sufijo}`, telefono: '3001234567',
      motos: [{ placa: `IT${sufijo.slice(-4)}` }],
    });
    const plan = (await api.listarPlanes({ activo: true })).items[0]!;
    const membresia = await api.crearMembresia({
      cliente_id: cliente.id, plan_id: plan.id, pago_inicial: { monto: plan.precio, metodo: 'efectivo' },
    });
    expect(membresia.cliente.id).toBe(cliente.id);
    const previa = await api.previsualizarPago({ membresia_id: membresia.id });
    const pago = await api.registrarPago({ membresia_id: membresia.id, monto: previa.monto_sugerido, metodo: 'transferencia' });
    expect(pago.membresia.fecha_vencimiento).toBe(previa.vencimiento_nuevo);
    expect((await api.listarPagosDeMembresia(membresia.id)).total).toBe(2);

    // Un error del contrato llega como ErrorApi con su código.
    await expect(api.crearMembresia({
      cliente_id: cliente.id, plan_id: plan.id, pago_inicial: { monto: plan.precio, metodo: 'efectivo' },
    })).rejects.toMatchObject({ status: 409, codigo: 'membresia_existente' });
  }, 30_000);
});
