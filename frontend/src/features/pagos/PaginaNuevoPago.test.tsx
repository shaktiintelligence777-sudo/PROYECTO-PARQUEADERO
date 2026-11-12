import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fijarApi } from '@/api';
import { formatoFecha } from '@/lib/formato';
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
const abrir = async (nombre: string) => {
  const m = await membresiaDe(nombre);
  montar(`/pagos/nuevo?membresia=${m.id}`, e);
  return m;
};
const monto = () => screen.findByLabelText('Monto *');

describe('P7 · registrar pago', () => {
  it('CA-4 el resumen muestra lo que devuelve la vista previa y el botón dice "Registrar $85.000"', async () => {
    const m = await abrir('Carlos');
    const vp = await e.api.previsualizarPago({ membresia_id: m.id, periodos: 1 });
    const resumen = await screen.findByLabelText('Resumen');
    await waitFor(() => expect(within(resumen).getByText('Nuevo vencimiento')).toBeInTheDocument());
    expect(within(resumen).getByText('Cubre')).toBeInTheDocument();
    expect(within(resumen).getByText('Vencimiento actual')).toBeInTheDocument();
    const [cubre, actual, nuevo] = [...resumen.querySelectorAll('dd')].map((d) => d.textContent);
    expect(cubre).toBe(`${formatoFecha(vp.periodo_desde)} – ${formatoFecha(vp.periodo_hasta)}`);
    expect(actual).toBe(formatoFecha(vp.vencimiento_actual));
    expect(nuevo).toBe(formatoFecha(vp.vencimiento_nuevo));
    expect(await screen.findByRole('button', { name: 'Registrar $85.000' })).toBeEnabled();
    expect(await monto()).toHaveValue('$ 85.000');
  });

  it('CA-5 con 3 periodos el monto pasa a $255.000 y el nuevo vencimiento se actualiza', async () => {
    const m = await abrir('Carlos');
    const u = userEvent.setup();
    const resumen = await screen.findByLabelText('Resumen');
    await waitFor(() => expect(resumen.querySelectorAll('dd')).toHaveLength(3));
    const antes = resumen.querySelectorAll('dd')[2]!.textContent;
    await u.click(screen.getByRole('button', { name: 'Más periodos' }));
    await u.click(screen.getByRole('button', { name: 'Más periodos' }));
    expect(await screen.findByRole('button', { name: 'Registrar $255.000' })).toBeEnabled();
    expect(await monto()).toHaveValue('$ 255.000');
    expect(screen.getByLabelText('Número de periodos')).toHaveTextContent('3');
    const vp = await e.api.previsualizarPago({ membresia_id: m.id, periodos: 3 });
    expect(vp.vencimiento_nuevo).not.toBe('');
    expect(screen.getByLabelText('Resumen').querySelectorAll('dd')[2]!.textContent).not.toBe(antes);
  });

  it('CA-6 un monto editado a mano no se sobrescribe y exige nota con el monto sugerido', async () => {
    await abrir('Carlos');
    const u = userEvent.setup();
    const campo = await monto();
    await screen.findByRole('button', { name: 'Registrar $85.000' });
    await u.clear(campo);
    await u.type(campo, '50000');
    await u.click(screen.getByRole('button', { name: 'Más periodos' }));
    await waitFor(() => expect(screen.getByLabelText('Resumen').querySelectorAll('dd')).toHaveLength(3));
    expect(campo).toHaveValue('$ 50.000');
    await u.click(screen.getByRole('button', { name: 'Registrar $50.000' }));
    expect(await screen.findByText('Explica por qué el monto es distinto al sugerido ($170.000).')).toBeInTheDocument();
  });

  it('CA-6 con $85.000 sugeridos, el mensaje cita $85.000', async () => {
    await abrir('Carlos');
    const u = userEvent.setup();
    const campo = await monto();
    await screen.findByRole('button', { name: 'Registrar $85.000' });
    await u.clear(campo);
    await u.type(campo, '50000');
    await u.click(screen.getByRole('button', { name: 'Registrar $50.000' }));
    expect(await screen.findByText('Explica por qué el monto es distinto al sugerido ($85.000).')).toBeInTheDocument();
  });

  it('CA-7 una membresía vencida muestra el aviso', async () => {
    await abrir('Camilo');
    expect(await screen.findByText(/La membresía está vencida: el nuevo periodo continúa desde el vencimiento anterior \(/)).toBeInTheDocument();
  });

  it('CA-8 registrar muestra la confirmación y la ficha refleja el nuevo vencimiento', async () => {
    const m = await abrir('Carlos');
    const u = userEvent.setup();
    const vp = await e.api.previsualizarPago({ membresia_id: m.id, periodos: 1 });
    await u.click(await screen.findByRole('button', { name: 'Registrar $85.000' }));
    expect(await screen.findByRole('heading', { name: 'Pago registrado' })).toBeInTheDocument();
    expect(screen.getByText('$85.000 · Efectivo')).toBeInTheDocument();
    expect(screen.getByText('Carlos Pérez')).toBeInTheDocument();
    expect(screen.getByText(/^Vence el /)).toBeInTheDocument();
    await u.click(screen.getByRole('link', { name: 'Ver cliente' }));
    await screen.findByRole('heading', { name: 'Carlos Pérez' });
    await waitFor(async () => {
      const m2 = await membresiaDe('Carlos');
      expect(m2.fecha_vencimiento).toBe(vp.vencimiento_nuevo);
    });
    const tarjeta = screen.getByRole('heading', { name: 'Membresía' }).closest('section')!;
    await waitFor(() => expect(within(tarjeta).getByText(/^Vence el /).textContent).not.toBe(''));
  });

  it('"Registrar otro pago" vuelve al formulario vacío (buscador)', async () => {
    await abrir('Carlos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Registrar $85.000' }));
    await u.click(await screen.findByRole('button', { name: 'Registrar otro pago' }));
    expect(await screen.findByRole('searchbox', { name: 'Buscar membresía' })).toBeInTheDocument();
  });

  it('CA-9 sin parámetro se muestra el buscador y al elegir un resultado se carga el formulario', async () => {
    montar('/pagos/nuevo', e);
    const u = userEvent.setup();
    const buscador = await screen.findByRole('searchbox', { name: 'Buscar membresía' });
    expect(buscador).toHaveAttribute('placeholder', 'Busca por nombre, documento o placa');
    await u.type(buscador, 'carlos');
    const lista = await screen.findByRole('list', { name: 'Resultados' }, { timeout: 3000 });
    await u.click(within(lista).getByRole('button', { name: /Carlos Pérez/ }));
    expect(await screen.findByLabelText('Resumen')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Registrar $85.000' })).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion').textContent).toMatch(/membresia=/);
  });

  it('CA-9 el buscador no ofrece membresías canceladas', async () => {
    montar('/pagos/nuevo', e);
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar membresía' }), { target: { value: 'felipe' } });
    expect(await screen.findByText('No hay membresías con este filtro.', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('CA-10 plan_inactivo muestra el aviso con enlace a la ficha y deshabilita registrar', async () => {
    await iniciarSesion(e, 'admin');
    const m = await membresiaDe('Carlos');
    await e.api.editarPlan(m.plan.id, { activo: false });
    montar(`/pagos/nuevo?membresia=${m.id}`, e);
    expect(await screen.findByText('El plan de esta membresía ya no está disponible. Cambia el plan antes de registrar el pago.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver cliente' })).toHaveAttribute('href', `/clientes/${m.cliente.id}`);
    expect(screen.getByRole('button', { name: /^Registrar/ })).toBeDisabled();
  });

  it('membresia_cancelada muestra "Esta membresía está cancelada."', async () => {
    const cancelada = (await e.api.listarMembresias({ estado: 'cancelada' })).items[0]!;
    montar(`/pagos/nuevo?membresia=${cancelada.id}`, e);
    expect(await screen.findByText('Esta membresía está cancelada.')).toBeInTheDocument();
  });

  it('CA-18 pulsar dos veces "Registrar" crea un solo pago', async () => {
    await abrir('Carlos');
    const espia = vi.spyOn(e.api, 'registrarPago');
    const boton = await screen.findByRole('button', { name: 'Registrar $85.000' });
    await act(async () => { fireEvent.click(boton); fireEvent.click(boton); });
    await screen.findByRole('heading', { name: 'Pago registrado' });
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('el método se elige con el grupo de opciones (Transferencia)', async () => {
    await abrir('Carlos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('radio', { name: 'Transferencia' }));
    await u.click(await screen.findByRole('button', { name: 'Registrar $85.000' }));
    expect(await screen.findByText('$85.000 · Transferencia')).toBeInTheDocument();
  });
});
