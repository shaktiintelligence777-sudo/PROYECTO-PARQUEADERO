import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fijarApi } from '@/api';
import { crearEntorno, iniciarSesion, montar, type Entorno } from '@/test/montar';

let e: Entorno;
beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  e = crearEntorno();
  await iniciarSesion(e);
});
afterEach(() => { fijarApi(null); });

const idDe = async (nombre: string) => (await e.api.listarClientes({ q: nombre })).items[0]!.id;
const abrir = async (nombre: string) => {
  const id = await idDe(nombre);
  montar(`/clientes/${id}`, e);
  return id;
};

describe('P4 · ficha del cliente', () => {
  it('muestra datos, membresía y motos', async () => {
    await abrir('Carlos');
    expect(await screen.findByRole('heading', { name: 'Carlos Pérez' })).toBeInTheDocument();
    expect(screen.queryByText(/900000001/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^\d+/ }).getAttribute('href')).toMatch(/^tel:/);
    expect(screen.getByRole('heading', { name: 'Membresía' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Placa ABC12D' })).toBeInTheDocument();
  });

  it('CA-10 un cliente sin email muestra el aviso', async () => {
    await abrir('Daniela');
    expect(await screen.findByText('Sin email: no recibirá avisos de vencimiento.')).toBeInTheDocument();
  });

  it('un cliente con email no muestra el aviso', async () => {
    await abrir('Carlos');
    await screen.findByRole('heading', { name: 'Carlos Pérez' });
    expect(screen.queryByText('Sin email: no recibirá avisos de vencimiento.')).not.toBeInTheDocument();
  });

  it('CA-11 "+ Moto" agrega la moto a la lista sin recargar', async () => {
    await abrir('Carlos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: '+ Moto' }));
    const hoja = await screen.findByRole('dialog');
    await u.type(within(hoja).getByLabelText('Placa *'), 'new-01a');
    await u.type(within(hoja).getByLabelText('Marca'), 'Honda');
    await u.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    const lista = await screen.findByRole('list', { name: 'Motos del cliente' });
    await waitFor(() => expect(within(lista).getByRole('img', { name: 'Placa NEW01A' })).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('una placa repetida al agregar moto se marca bajo la placa', async () => {
    await abrir('Carlos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: '+ Moto' }));
    const hoja = await screen.findByRole('dialog');
    await u.type(within(hoja).getByLabelText('Placa *'), 'XYZ34E');
    await u.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    expect(await within(hoja).findByText('Esa placa ya está registrada.')).toBeInTheDocument();
  });

  it('se puede editar una moto', async () => {
    await abrir('Carlos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Editar moto ABC12D' }));
    const hoja = await screen.findByRole('dialog');
    const color = within(hoja).getByLabelText('Color');
    await u.clear(color);
    await u.type(color, 'Verde');
    await u.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByText(/Verde/)).toBeInTheDocument());
  });

  it('CA-12 una moto dentro lleva la insignia "Dentro"', async () => {
    await abrir('Carlos');
    const lista = await screen.findByRole('list', { name: 'Motos del cliente' });
    expect(within(lista).getByText('Dentro')).toBeInTheDocument();
  });

  it('CA-12 una moto fuera no la lleva', async () => {
    await abrir('María');
    const lista = await screen.findByRole('list', { name: 'Motos del cliente' });
    expect(within(lista).queryByText('Dentro')).not.toBeInTheDocument();
  });

  it('CA-13 el operador no ve "Desactivar cliente" ni la pestaña "Accesos"', async () => {
    await abrir('María');
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Desactivar cliente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Accesos' })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Pagos' })).toBeInTheDocument();
  });

  it('CA-13 el admin sí los ve', async () => {
    await iniciarSesion(e, 'admin');
    await abrir('María');
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: 'Desactivar cliente' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Accesos' })).toBeInTheDocument();
  });

  it('el admin ve los accesos del cliente', async () => {
    await iniciarSesion(e, 'admin');
    await abrir('Carlos');
    await userEvent.click(await screen.findByRole('radio', { name: 'Accesos' }));
    const lista = await screen.findByRole('list', { name: 'Accesos del cliente' });
    expect(within(lista).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('el admin desactiva un cliente sin motos dentro y se muestra inactivo', async () => {
    await iniciarSesion(e, 'admin');
    await abrir('María');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Editar' }));
    await u.click(await screen.findByRole('button', { name: 'Desactivar cliente' }));
    expect(await screen.findByText('El cliente y sus motos dejarán de aparecer en las búsquedas. Su historial se conserva.')).toBeInTheDocument();
    const dialogos = screen.getAllByRole('dialog');
    await u.click(within(dialogos[dialogos.length - 1]!).getByRole('button', { name: 'Desactivar cliente' }));
    await waitFor(() => expect(screen.getByText('Inactivo')).toBeInTheDocument());
  });

  it('CA-14 desactivar un cliente con una moto dentro muestra el mensaje de la API y no cambia nada', async () => {
    await iniciarSesion(e, 'admin');
    const id = await abrir('Carlos');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Editar' }));
    await u.click(await screen.findByRole('button', { name: 'Desactivar cliente' }));
    const dialogos = screen.getAllByRole('dialog');
    await u.click(within(dialogos[dialogos.length - 1]!).getByRole('button', { name: 'Desactivar cliente' }));
    expect(await screen.findByText('El cliente tiene una moto dentro del parqueadero.')).toBeInTheDocument();
    expect((await e.api.obtenerCliente(id)).activo).toBe(true);
  });

  it('CA-15 con cambios en la hoja de edición, cerrar pide confirmar', async () => {
    await abrir('María');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Editar' }));
    const hoja = await screen.findByRole('dialog');
    await u.type(within(hoja).getByLabelText('Notas (opcional)'), 'algo');
    await u.click(within(hoja).getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
  });

  it('se puede editar el cliente', async () => {
    await abrir('María');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Editar' }));
    const hoja = await screen.findByRole('dialog');
    const nombre = within(hoja).getByLabelText('Nombre(s) *');
    await u.clear(nombre);
    await u.type(nombre, 'María G. Gómez');
    await u.click(within(hoja).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('heading', { name: 'María G. Gómez' })).toBeInTheDocument();
  });

  it('CA-16 la pestaña Pagos lista los pagos y tacha los anulados con "Anulado"', async () => {
    await iniciarSesion(e, 'admin');
    const id = await idDe('Juan');
    const m = (await e.api.obtenerCliente(id)).membresia!;
    const pago = await e.api.registrarPago({ membresia_id: m.id, monto: m.plan.precio, metodo: 'efectivo' });
    await e.api.anularPago(pago.pago.id, { motivo: 'Error de digitación' });
    montar(`/clientes/${id}`, e);
    const lista = await screen.findByRole('list', { name: 'Pagos del cliente' });
    const anulados = within(lista).getAllByText('Anulado');
    expect(anulados.length).toBeGreaterThan(0);
    anulados.forEach((a) => expect(a.closest('li')!.querySelector('.line-through')).not.toBeNull());
    const vigentes = within(lista).getAllByRole('listitem').filter((li) => !within(li).queryByText('Anulado'));
    vigentes.forEach((li) => expect(li.querySelector('.line-through')).toBeNull());
  });
});
