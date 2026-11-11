import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, fijarApi } from '@/api';
import { crearEntorno, iniciarSesion, montar, type Entorno } from '@/test/montar';

vi.mock('@/lib/fechas', async (original) => ({ ...(await original<typeof import('@/lib/fechas')>()), hoyBogota: () => '2026-11-10' }));

let e: Entorno;
beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  e = crearEntorno();
  await iniciarSesion(e);
});
afterEach(() => { fijarApi(null); });

const abrir = async (nombre: string, query = '') => {
  const id = (await e.api.listarClientes({ q: nombre })).items[0]!.id;
  montar(`/clientes/${id}${query}`, e);
  return id;
};
const tarjeta = () => screen.getByRole('heading', { name: 'Membresía' }).closest('section')!;

async function llenarCrear(u: ReturnType<typeof userEvent.setup>, plan = 'Mensual') {
  const hoja = await screen.findByRole('dialog');
  await waitFor(() => expect(within(hoja).getByRole('option', { name: new RegExp(plan) })).toBeInTheDocument());
  await u.selectOptions(within(hoja).getByLabelText('Plan *'), within(hoja).getByRole('option', { name: new RegExp(plan) }));
  return hoja;
}

describe('Tarjeta de membresía', () => {
  it('CA-11 crear membresía: línea "Cubre", toast y tarjeta "Activa"', async () => {
    await abrir('Natalia');
    const u = userEvent.setup();
    expect(await screen.findByText('Este cliente no tiene membresía.')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Crear membresía' }));
    const hoja = await llenarCrear(u);
    expect(within(hoja).getByText('Cubre del 10 nov 2026 al 9 dic 2026')).toBeInTheDocument();
    expect(within(hoja).getByLabelText('Monto *')).toHaveValue('$ 60.000');
    await u.click(within(hoja).getByRole('button', { name: 'Crear y registrar pago' }));
    expect(await screen.findByText('Membresía creada. Vence el 9 dic 2026.')).toBeInTheDocument();
    await waitFor(() => expect(within(tarjeta()).getByText('Activa')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la hoja "Crear membresía" se abre sola con ?crear_membresia=1', async () => {
    await abrir('Natalia', '?crear_membresia=1');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crear membresía · Natalia Mejía' })).toBeInTheDocument();
  });

  it('un monto distinto del precio exige nota', async () => {
    await abrir('Natalia');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Crear membresía' }));
    const hoja = await llenarCrear(u);
    const monto = within(hoja).getByLabelText('Monto *');
    await u.clear(monto);
    await u.type(monto, '50000');
    await u.click(within(hoja).getByRole('button', { name: 'Crear y registrar pago' }));
    expect(await within(hoja).findAllByText('Explica por qué el monto es distinto al del plan.')).not.toHaveLength(0);
  });

  it('CA-12 membresia_existente muestra el aviso en la hoja', async () => {
    await abrir('Natalia');
    vi.spyOn(e.api, 'crearMembresia').mockRejectedValue(new ErrorApi(409, 'membresia_existente', 'x'));
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Crear membresía' }));
    const hoja = await llenarCrear(u);
    await u.click(within(hoja).getByRole('button', { name: 'Crear y registrar pago' }));
    expect(await within(hoja).findByText('Este cliente ya tiene una membresía.')).toBeInTheDocument();
  });

  it('plan_inactivo muestra "Ese plan ya no está disponible."', async () => {
    await abrir('Natalia');
    vi.spyOn(e.api, 'crearMembresia').mockRejectedValue(new ErrorApi(409, 'plan_inactivo', 'x'));
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Crear membresía' }));
    const hoja = await llenarCrear(u);
    await u.click(within(hoja).getByRole('button', { name: 'Crear y registrar pago' }));
    expect(await within(hoja).findByText('Ese plan ya no está disponible.')).toBeInTheDocument();
  });

  it('CA-13 cambiar plan muestra el plan nuevo con la misma fecha de vencimiento', async () => {
    const id = await abrir('Carlos');
    const antes = (await e.api.obtenerCliente(id)).membresia!;
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Cambiar plan' }));
    const hoja = await screen.findByRole('dialog');
    expect(within(hoja).getByText('El cambio aplica desde el próximo pago. La fecha de vencimiento actual no cambia.')).toBeInTheDocument();
    await waitFor(() => expect(within(hoja).getByRole('option', { name: /Quincenal/ })).toBeInTheDocument());
    await u.selectOptions(within(hoja).getByLabelText('Plan *'), within(hoja).getByRole('option', { name: /Quincenal/ }));
    await u.click(within(hoja).getByRole('button', { name: 'Cambiar plan' }));
    await waitFor(() => expect(within(tarjeta()).getByText(/^Quincenal/)).toBeInTheDocument());
    const despues = (await e.api.obtenerCliente(id)).membresia!;
    expect(despues.fecha_vencimiento).toBe(antes.fecha_vencimiento);
    expect(within(tarjeta()).getByText(/^Vence el /)).toBeInTheDocument();
  });

  it('CA-14 el admin cancela con motivo y la tarjeta pasa a "no tiene membresía"', async () => {
    await iniciarSesion(e, 'admin');
    await abrir('Carlos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Cancelar membresía' }));
    expect(await screen.findByText('¿Cancelar la membresía de Carlos Pérez?')).toBeInTheDocument();
    expect(screen.getByText('Esta acción es definitiva. Para volver, habrá que crear una membresía nueva.')).toBeInTheDocument();
    const dialogo = screen.getAllByRole('dialog').at(-1)!;
    const confirmar = within(dialogo).getByRole('button', { name: 'Cancelar membresía' });
    await u.type(within(dialogo).getByLabelText('Motivo'), 'abc');
    expect(confirmar).toBeDisabled();
    await u.type(within(dialogo).getByLabelText('Motivo'), 'def');
    expect(confirmar).toBeEnabled();
    await u.click(confirmar);
    await waitFor(() => expect(within(tarjeta()).getByText('Este cliente no tiene membresía.')).toBeInTheDocument());
  });

  it('CA-15 el operador no ve "Cancelar membresía"', async () => {
    await abrir('Carlos');
    await screen.findByRole('button', { name: 'Cambiar plan' });
    expect(screen.queryByRole('button', { name: 'Cancelar membresía' })).not.toBeInTheDocument();
  });

  it('muestra el plan, el vencimiento y el botón Registrar pago', async () => {
    const id = await abrir('Carlos');
    const m = (await e.api.obtenerCliente(id)).membresia!;
    expect(await screen.findByRole('link', { name: 'Registrar pago' })).toHaveAttribute('href', `/pagos/nuevo?membresia=${m.id}`);
    expect(within(tarjeta()).getByText(/^Mensual · \$60\.000$/)).toBeInTheDocument();
  });
});
