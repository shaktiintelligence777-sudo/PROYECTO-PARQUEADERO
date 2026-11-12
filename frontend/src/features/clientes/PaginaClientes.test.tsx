import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, fijarApi } from '@/api';
import { crearEntorno, iniciarSesion, montar, type Entorno } from '@/test/montar';

let e: Entorno;
beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  e = crearEntorno();
  await iniciarSesion(e);
});
afterEach(() => { fijarApi(null); });

const lista = () => screen.findByRole('list', { name: 'Lista de clientes' });
const url = () => screen.getByTestId('ubicacion').textContent;

describe('P4 · lista de clientes', () => {
  it('CA-1 escribir "jose" filtra tras 300 ms y deja q=jose en la URL', async () => {
    montar('/clientes', e);
    expect(within(await lista()).getAllByRole('listitem').length).toBeGreaterThan(1);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar clientes' }), 'jose');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Lista de clientes' })).getAllByRole('listitem')).toHaveLength(1), { timeout: 3000 });
    expect(within(screen.getByRole('list', { name: 'Lista de clientes' })).getByText('José Martínez')).toBeInTheDocument();
    expect(url()).toContain('q=jose');
  });

  it('CA-2 el filtro "Vencida" deja solo vencidas y se conserva al recargar', async () => {
    const { unmount } = montar('/clientes', e);
    await lista();
    await userEvent.click(screen.getByRole('radio', { name: 'Vencida' }));
    await waitFor(() => expect(url()).toContain('estado=vencida'));
    await waitFor(() => {
      const filas = within(screen.getByRole('list', { name: 'Lista de clientes' })).getAllByRole('listitem');
      expect(filas).toHaveLength(2);
      filas.forEach((li) => expect(within(li).getByText('Vencida')).toBeInTheDocument());
    });
    unmount();
    montar(`/clientes?estado=vencida`, e); // recarga: el filtro sale de la URL
    expect(await screen.findByRole('radio', { name: 'Vencida' })).toBeChecked();
    const filas = within(await lista()).getAllByRole('listitem');
    filas.forEach((li) => expect(within(li).getByText('Vencida')).toBeInTheDocument());
  });

  it('CA-3 sin resultados muestra el vacío y "Limpiar filtros" restablece la lista', async () => {
    montar('/clientes?q=zzzzqq', e);
    expect(await screen.findByText('Ningún cliente coincide con la búsqueda.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(within(await lista()).getAllByRole('listitem').length).toBeGreaterThan(5);
    expect(url()).toBe('/clientes');
    expect(screen.getByRole('searchbox', { name: 'Buscar clientes' })).toHaveValue('');
  });

  it('CA-4 un cliente con tres motos muestra dos placas y "+1"', async () => {
    await e.api.crearCliente({
      nombre: 'Zacarías Tres', documento: 'ZAC12345', telefono: '3001234567',
      motos: [{ placa: 'AAA11A' }, { placa: 'BBB22B' }, { placa: 'CCC33C' }],
    });
    montar('/clientes?q=zacarias', e);
    const fila = within(await lista()).getAllByRole('listitem')[0]!;
    expect(within(fila).getAllByRole('img')).toHaveLength(2);
    expect(within(fila).getByText('+1')).toBeInTheDocument();
  });

  it('CA-17 un error de carga muestra el mensaje y "Reintentar" repite la consulta', async () => {
    const espia = vi.spyOn(e.api, 'listarClientes').mockRejectedValueOnce(new ErrorApi(500, 'error_interno', 'x'));
    montar('/clientes', e);
    expect(await screen.findByText('No pudimos cargar esta información.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(within(await lista()).getAllByRole('listitem').length).toBeGreaterThan(1);
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it('CA-13 el operador no ve "Mostrar inactivos"; el admin sí', async () => {
    const { unmount } = montar('/clientes', e);
    await lista();
    expect(screen.queryByRole('checkbox', { name: 'Mostrar inactivos' })).not.toBeInTheDocument();
    unmount();
    await iniciarSesion(e, 'admin');
    montar('/clientes', e);
    expect(await screen.findByRole('checkbox', { name: 'Mostrar inactivos' })).toBeInTheDocument();
  });

  it('el admin ve solo los inactivos con la insignia "Inactivo"', async () => {
    await iniciarSesion(e, 'admin');
    const c = (await e.api.listarClientes({ q: 'Natalia' })).items[0]!;
    await e.api.editarCliente(c.id, { activo: false });
    montar('/clientes?inactivos=1', e);
    const fila = within(await lista()).getAllByRole('listitem');
    expect(fila).toHaveLength(1);
    expect(within(fila[0]!).getByText('Inactivo')).toBeInTheDocument();
  });

  it('la tabla de escritorio usa los mismos datos', async () => {
    montar('/clientes', e);
    await lista();
    const tabla = screen.getByRole('table', { name: 'Tabla de clientes' });
    ['Nombre', 'Teléfono', 'Placas', 'Membresía', 'Vence'].forEach((t) => expect(within(tabla).getByRole('columnheader', { name: t })).toBeInTheDocument());
    expect(within(tabla).queryByRole('columnheader', { name: 'Documento' })).not.toBeInTheDocument();
  });

  it('CA-ORD escritorio: cada cabecera de la tabla de clientes tiene botón de orden', async () => {
    montar('/clientes', e);
    await lista();
    const tabla = screen.getByRole('table', { name: 'Tabla de clientes' });
    ['Nombre', 'Teléfono', 'Placas', 'Membresía', 'Vence'].forEach((t) =>
      expect(within(tabla).getByRole('button', { name: `Ordenar por ${t}` })).toBeInTheDocument());
    await userEvent.click(within(tabla).getByRole('button', { name: 'Ordenar por Nombre' }));
    expect(within(tabla).getByRole('columnheader', { name: /Nombre/ })).toHaveAttribute('aria-sort', 'ascending');
  });
});
