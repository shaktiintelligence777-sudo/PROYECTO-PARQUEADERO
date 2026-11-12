import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fijarApi } from '@/api';
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

const membresiaDe = async (nombre: string) => (await e.api.listarMembresias({ q: nombre })).items[0]!;
const lista = () => screen.findByRole('list', { name: 'Lista de pagos' });
const url = () => screen.getByTestId('ubicacion').textContent;

describe('Lista de pagos', () => {
  it('CA-16 por defecto muestra los de hoy y "Últimos 7 días" amplía el rango y la URL lo refleja', async () => {
    const hoy = (await e.api.listarPagos({ desde: '2026-11-10', hasta: '2026-11-10' })).total;
    const semana = (await e.api.listarPagos({ desde: '2026-11-04', hasta: '2026-11-10' })).total;
    expect(semana).toBeGreaterThan(hoy);
    montar('/pagos', e);
    expect(await screen.findByRole('radio', { name: 'Hoy' })).toBeChecked();
    expect(await screen.findByRole('heading', { name: `${hoy} pagos` })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Últimos 7 días' }));
    await waitFor(() => expect(url()).toContain('rango=7dias'));
    expect(await screen.findByRole('heading', { name: `${semana} pagos` })).toBeInTheDocument();
  });

  it('un periodo sin pagos muestra el vacío', async () => {
    montar('/pagos?rango=personalizado&desde=2020-01-01&hasta=2020-01-02', e);
    expect(await screen.findByText('No hay pagos en este periodo.')).toBeInTheDocument();
  });

  it('cada elemento muestra cliente, monto, método y quién registró', async () => {
    montar('/pagos', e);
    const fila = within(await lista()).getAllByRole('listitem')[0]!;
    expect(within(fila).getByText(/^\$[\d.]+$/)).toBeInTheDocument();
    expect(within(fila).getByText(/Registró: /)).toBeInTheDocument();
    expect(within(fila).getByText(/Efectivo|Transferencia|Otro/)).toBeInTheDocument();
  });

  it('el filtro por método se refleja en la URL', async () => {
    montar('/pagos?rango=7dias', e);
    await lista();
    await userEvent.selectOptions(screen.getByLabelText('Método'), 'Transferencia');
    await waitFor(() => expect(url()).toContain('metodo=transferencia'));
  });

  it('"Personalizado" muestra dos fechas', async () => {
    montar('/pagos?rango=personalizado', e);
    expect(await screen.findByLabelText('Desde')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInTheDocument();
  });

  it('CA-17 el admin anula el último pago con motivo y queda tachado con "Anulado"', async () => {
    await iniciarSesion(e, 'admin');
    const m = await membresiaDe('Carlos');
    await e.api.registrarPago({ membresia_id: m.id, monto: 85000, metodo: 'efectivo' });
    montar('/pagos', e);
    const u = userEvent.setup();
    await u.click(within(await lista()).getAllByRole('button', { name: /Carlos Pérez/ })[0]!);
    await u.click(await screen.findByRole('button', { name: 'Anular pago' }));
    expect(await screen.findByText('¿Anular este pago de $85.000?')).toBeInTheDocument();
    const dialogo = screen.getAllByRole('dialog').at(-1)!;
    await u.type(within(dialogo).getByLabelText('Motivo'), 'Error de digitación');
    await u.click(within(dialogo).getByRole('button', { name: 'Anular pago' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const fila = within(await lista()).getAllByRole('listitem')[0]!;
    expect(within(fila).getByText('Anulado')).toBeInTheDocument();
    expect(fila.querySelector('.line-through')).not.toBeNull();
  });

  it('CA-17 pago_no_anulable muestra el mensaje exacto', async () => {
    await iniciarSesion(e, 'admin');
    const natalia = (await e.api.listarClientes({ q: 'Natalia' })).items[0]!;
    const plan = (await e.api.listarPlanes({ activo: true })).items[0]!;
    await e.api.crearMembresia({ cliente_id: natalia.id, plan_id: plan.id, pago_inicial: { monto: plan.precio, metodo: 'efectivo' } });
    montar('/pagos', e);
    const u = userEvent.setup();
    await u.click(within(await lista()).getByRole('button', { name: /Natalia Mejía/ }));
    await u.click(await screen.findByRole('button', { name: 'Anular pago' }));
    const dialogo = screen.getAllByRole('dialog').at(-1)!;
    await u.type(within(dialogo).getByLabelText('Motivo'), 'Error de digitación');
    await u.click(within(dialogo).getByRole('button', { name: 'Anular pago' }));
    expect(await screen.findByText('Solo se puede anular el último pago de una membresía.')).toBeInTheDocument();
  });

  it('CA-15 el operador no ve "Anular pago"', async () => {
    const m = await membresiaDe('Carlos');
    await e.api.registrarPago({ membresia_id: m.id, monto: 85000, metodo: 'efectivo' });
    montar('/pagos', e);
    await userEvent.click(within(await lista()).getAllByRole('button', { name: /Carlos Pérez/ })[0]!);
    expect(await screen.findByRole('heading', { name: 'Detalle del pago' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular pago' })).not.toBeInTheDocument();
  });

  it('el botón "Registrar pago" lleva a /pagos/nuevo', async () => {
    montar('/pagos', e);
    await userEvent.click(await screen.findByRole('link', { name: 'Registrar pago' }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar membresía' })).toBeInTheDocument();
  });
});
