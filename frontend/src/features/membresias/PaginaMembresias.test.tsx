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

const lista = () => screen.findByRole('list', { name: 'Lista de membresías' });

describe('P6 · membresías', () => {
  it('CA-1 sin filtro: orden por vencimiento ascendente y sin canceladas', async () => {
    montar('/membresias', e);
    const filas = within(await lista()).getAllByRole('listitem');
    const nombres = filas.map((li) => li.querySelector('.font-semibold')!.textContent);
    expect(nombres.slice(0, 2)).toEqual(['Daniela Castro', 'Camilo Ortiz']);
    expect(nombres).not.toContain('Felipe Vargas');
    const esperado = (await e.api.listarMembresias({ por_pagina: 100 })).items.map((m) => m.cliente.nombre);
    expect(nombres).toEqual(esperado);
  });

  it('CA-1 con "Canceladas": solo canceladas y sin botón "Renovar"', async () => {
    montar('/membresias', e);
    await lista();
    await userEvent.click(screen.getByRole('radio', { name: 'Canceladas' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Lista de membresías' })).getAllByRole('listitem')).toHaveLength(1));
    const fila = within(screen.getByRole('list', { name: 'Lista de membresías' })).getByRole('listitem');
    expect(within(fila).getByText('Felipe Vargas')).toBeInTheDocument();
    expect(within(fila).getByText('Cancelada')).toBeInTheDocument();
    expect(within(fila).queryByRole('link', { name: 'Renovar' })).not.toBeInTheDocument();
  });

  it('CA-2 /membresias?estado=por_vencer deja seleccionado "Por vencer"', async () => {
    montar('/membresias?estado=por_vencer', e);
    expect(await screen.findByRole('radio', { name: 'Por vencer' })).toBeChecked();
    const filas = within(await lista()).getAllByRole('listitem');
    filas.forEach((li) => expect(within(li).getByText('Por vencer')).toBeInTheDocument());
  });

  it('CA-3 "Renovar" abre /pagos/nuevo con esa membresía y el resumen cargado', async () => {
    montar('/membresias', e);
    const fila = within(await lista()).getAllByRole('listitem')[0]!;
    expect(within(fila).getByText('Daniela Castro')).toBeInTheDocument();
    await userEvent.click(within(fila).getByRole('link', { name: 'Renovar' }));
    expect(await screen.findByRole('heading', { name: 'Registrar pago' })).toBeInTheDocument();
    expect(screen.getByTestId('ubicacion').textContent).toMatch(/^\/pagos\/nuevo\?membresia=/);
    expect(await screen.findByText('Nuevo vencimiento')).toBeInTheDocument();
    expect(screen.getByText('Daniela Castro')).toBeInTheDocument();
  });

  it('un filtro sin resultados muestra el vacío', async () => {
    montar('/membresias?q=zzzzqq', e);
    expect(await screen.findByText('No hay membresías con este filtro.')).toBeInTheDocument();
  });

  it('la tabla de escritorio usa los mismos datos', async () => {
    montar('/membresias', e);
    await lista();
    const tabla = screen.getByRole('table', { name: 'Tabla de membresías' });
    ['Cliente', 'Plan', 'Inicio', 'Vence', 'Estado', 'Acciones'].forEach((t) => expect(within(tabla).getByRole('columnheader', { name: t })).toBeInTheDocument());
  });
});
