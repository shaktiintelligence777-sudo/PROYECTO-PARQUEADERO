import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

async function llenar(u: ReturnType<typeof userEvent.setup>, v: { nombre?: string; apellidos?: string; telefono?: string; placa?: string }) {
  if (v.nombre) await u.type(screen.getByLabelText('Nombre(s) *'), v.nombre);
  if (v.apellidos) await u.type(screen.getByLabelText('Apellido(s) (opcional)'), v.apellidos);
  if (v.telefono) await u.type(screen.getByLabelText('Teléfono (opcional)'), v.telefono);
  if (v.placa) { const p = screen.getByLabelText('Placa *'); await u.clear(p); await u.type(p, v.placa); }
}

describe('P5 · nuevo cliente', () => {
  it('CA-5 el formulario vacío pide solo el nombre y no llama a la API', async () => {
    const espia = vi.spyOn(e.api, 'crearCliente');
    montar('/clientes/nuevo', e);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar cliente' }));
    expect(await screen.findByText('Escribe el nombre.')).toBeInTheDocument();
    expect(screen.queryByText('El teléfono debe tener entre 7 y 15 dígitos.')).not.toBeInTheDocument();
    expect(screen.getByText('La placa debe tener entre 4 y 7 letras o números.')).toBeInTheDocument();
    expect(espia).not.toHaveBeenCalled();
  });

  it('CA-10 la pantalla no pide documento y el teléfono y el apellido son opcionales', async () => {
    montar('/clientes/nuevo', e);
    await screen.findByLabelText('Nombre(s) *');
    expect(screen.queryByLabelText(/Documento/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Apellido(s) (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Teléfono (opcional)')).toBeInTheDocument();
  });

  it('CA-11 solo con Nombre(s) se registra el cliente', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    await screen.findByLabelText('Nombre(s) *');
    await u.click(screen.getByRole('button', { name: 'Quitar moto 1' }));
    await llenar(u, { nombre: 'Solo Nombre' });
    await u.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(await screen.findByRole('heading', { name: 'Solo Nombre' })).toBeInTheDocument();
  });

  it('CA-12 el apellido, si se escribe, se muestra junto al nombre', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    await screen.findByLabelText('Nombre(s) *');
    await u.click(screen.getByRole('button', { name: 'Quitar moto 1' }));
    await llenar(u, { nombre: 'Ana', apellidos: 'Prueba Ruiz' });
    await u.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(await screen.findByRole('heading', { name: 'Ana Prueba Ruiz' })).toBeInTheDocument();
  });

  it('un email inválido muestra su mensaje', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Email (opcional)'), 'sin-arroba');
    await u.tab();
    expect(await screen.findByText('Ese email no parece válido.')).toBeInTheDocument();
  });

  it('CA-6 un alta válida con una moto abre la ficha con el cliente y su moto', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    await screen.findByLabelText('Nombre(s) *');
    await llenar(u, { nombre: 'Ana Prueba', telefono: '300 111 2233', placa: 'new-01a' });
    await u.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(await screen.findByText('Cliente registrado.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ana Prueba' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Placa NEW01A' })).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion').textContent).toMatch(/^\/clientes\/[^?]+\?crear_membresia=1$/);
  });

  it('se puede crear un cliente sin moto', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    await screen.findByLabelText('Nombre(s) *');
    await u.click(screen.getByRole('button', { name: 'Quitar moto 1' }));
    await llenar(u, { nombre: 'Sin Moto', telefono: '3001112233' });
    await u.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(await screen.findByRole('heading', { name: 'Sin Moto' })).toBeInTheDocument();
  });

  it('admite hasta 5 motos', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    for (let i = 0; i < 4; i++) await u.click(await screen.findByRole('button', { name: /^Agregar otra moto$/ }));
    expect(screen.getAllByLabelText('Placa *')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /Agregar/ })).not.toBeInTheDocument();
  });

  it('CA-8 una placa repetida se marca bajo esa placa', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    await screen.findByLabelText('Nombre(s) *');
    await llenar(u, { nombre: 'Otra Persona', telefono: '3001112233', placa: 'ABC12D' });
    await u.click(screen.getByRole('button', { name: 'Guardar cliente' }));
    expect(await screen.findByText('Esa placa ya está registrada.')).toBeInTheDocument();
  });

  it('CA-9 ?placa= rellena la primera placa', async () => {
    montar('/clientes/nuevo?placa=ZZZ99Z', e);
    expect(await screen.findByLabelText('Placa *')).toHaveValue('ZZZ99Z');
  });

  it('CA-15 con cambios, volver pide confirmar; "Seguir editando" conserva y "Descartar" sale', async () => {
    montar('/clientes/nuevo', e);
    const u = userEvent.setup();
    await u.type(await screen.findByLabelText('Nombre(s) *'), 'Algo');
    await u.click(screen.getByRole('button', { name: 'Volver' }));
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByLabelText('Nombre(s) *')).toHaveValue('Algo');
    await u.click(screen.getByRole('button', { name: 'Volver' }));
    await u.click(await screen.findByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/clientes'));
  });

  it('sin cambios, volver sale sin preguntar', async () => {
    montar('/clientes/nuevo', e);
    await userEvent.click(await screen.findByRole('button', { name: 'Volver' }));
    await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/clientes'));
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument();
  });
});
