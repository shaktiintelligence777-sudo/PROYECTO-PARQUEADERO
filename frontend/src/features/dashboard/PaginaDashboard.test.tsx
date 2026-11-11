import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, fijarApi, type DashboardResumen } from '@/api';
import { crearEntorno, iniciarSesion, montar, type Entorno } from '@/test/montar';

let e: Entorno;
beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  e = crearEntorno();
  await iniciarSesion(e, 'admin');
});
afterEach(() => { fijarApi(null); });

const base: DashboardResumen = {
  fecha: '2026-11-10', motos_dentro: 12, capacidad: 40, estancias_largas: 0, entradas_hoy: 18, salidas_hoy: 9,
  membresias: { activas: 20, por_vencer: 3, vencidas: 2 }, pagos_hoy: { cantidad: 3, total: 180000 }, proximos_vencimientos: [],
};
const conResumen = (parcial: Partial<DashboardResumen>) => vi.spyOn(e.api, 'resumenDashboard').mockResolvedValue({ ...base, ...parcial });
const indicador = async (etiqueta: string) => (await screen.findByText(etiqueta)).closest('a')!;

describe('P2 · dashboard', () => {
  it('CA-1 mientras carga muestra esqueletos de los cuatro indicadores y de la lista', async () => {
    vi.spyOn(e.api, 'resumenDashboard').mockReturnValue(new Promise(() => {}));
    montar('/', e);
    const carga = await screen.findByRole('status', { name: 'Cargando el resumen' });
    expect(carga.querySelectorAll('.animate-pulse').length).toBe(7);
    expect(carga.querySelector('.grid-cols-2')!.children).toHaveLength(4);
  });

  it('saludo con el primer nombre y la fecha de hoy', async () => {
    conResumen({});
    montar('/', e);
    expect(await screen.findByText(/^Hola, \S+ · mar 10 nov$/)).toBeInTheDocument();
  });

  it('CA-2 "12 / 40" con capacidad y "12" sin ella', async () => {
    conResumen({});
    const { unmount } = montar('/', e);
    expect(within(await indicador('Dentro ahora')).getByText('12 / 40')).toBeInTheDocument();
    expect(await indicador('Dentro ahora')).toHaveAttribute('href', '/acceso?vista=dentro');
    unmount();
    conResumen({ capacidad: null });
    montar('/', e);
    await waitFor(async () => expect(within(await indicador('Dentro ahora')).getByText('12')).toBeInTheDocument());
    expect(screen.queryByText('12 / 40')).not.toBeInTheDocument();
  });

  it('CA-3 "Vencidas" con valor > 0 usa tono peligro y enlaza a vencidas; con 0 no tiene tono', async () => {
    conResumen({});
    const { unmount } = montar('/', e);
    const a = await indicador('Vencidas');
    expect(a).toHaveAttribute('href', '/membresias?estado=vencida');
    expect(a.className).toContain('border-l-peligro');
    expect((await indicador('Por vencer')).className).toContain('border-l-aviso');
    expect(await indicador('Por vencer')).toHaveAttribute('href', '/membresias?estado=por_vencer');
    unmount();
    conResumen({ membresias: { activas: 20, por_vencer: 0, vencidas: 0 } });
    montar('/', e);
    await waitFor(async () => expect((await indicador('Vencidas')).className).not.toContain('border-l-'));
    expect((await indicador('Por vencer')).className).not.toContain('border-l-');
  });

  it('CA-4 pagos de hoy: "$180.000" y "3 pagos"; con 1, "1 pago"', async () => {
    conResumen({});
    const { unmount } = montar('/', e);
    const a = await indicador('Pagos de hoy');
    expect(within(a).getByText('$180.000')).toBeInTheDocument();
    expect(within(a).getByText('3 pagos')).toBeInTheDocument();
    expect(a).toHaveAttribute('href', '/pagos');
    unmount();
    conResumen({ pagos_hoy: { cantidad: 1, total: 60000 } });
    montar('/', e);
    await waitFor(async () => expect(within(await indicador('Pagos de hoy')).getByText('1 pago')).toBeInTheDocument());
  });

  it.each([
    [1, '1 moto lleva más de 24 h dentro.'],
    [3, '3 motos llevan más de 24 h dentro.'],
  ])('CA-5 estancias_largas %i muestra el aviso con enlace "Ver"', async (n, texto) => {
    conResumen({ estancias_largas: n });
    montar('/', e);
    expect(await screen.findByText(texto)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/acceso?vista=dentro');
  });

  it('CA-5 con 0 estancias largas no aparece el aviso', async () => {
    conResumen({ estancias_largas: 0 });
    montar('/', e);
    await indicador('Vencidas');
    expect(screen.queryByText(/más de 24 h dentro/)).not.toBeInTheDocument();
  });

  it('CA-6 cada vencimiento muestra nombre, insignia, placa y los días, y lleva a la ficha', async () => {
    montar('/', e);
    const lista = await screen.findByRole('list', { name: 'Próximos vencimientos' });
    const filas = within(lista).getAllByRole('listitem');
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.length).toBeLessThanOrEqual(5);
    const primera = (await e.api.resumenDashboard()).proximos_vencimientos[0]!;
    const fila = filas[0]!;
    expect(within(fila).getByText(primera.cliente.nombre)).toBeInTheDocument();
    expect(within(fila).getByText(/Vencida|Por vencer/)).toBeInTheDocument();
    expect(within(fila).getAllByRole('img').length).toBeGreaterThan(0);
    expect(within(fila).getByText(/^(vence|venció)/)).toBeInTheDocument();
    expect(within(fila).getByRole('link')).toHaveAttribute('href', `/clientes/${primera.cliente.id}`);
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/membresias');
  });

  it('CA-7 con la lista vacía muestra el mensaje', async () => {
    conResumen({ proximos_vencimientos: [] });
    montar('/', e);
    expect(await screen.findByText('Ninguna membresía vence en los próximos días.')).toBeInTheDocument();
  });

  it('CA-8 un error de carga muestra el mensaje y "Reintentar" repite la consulta', async () => {
    const espia = vi.spyOn(e.api, 'resumenDashboard').mockRejectedValueOnce(new ErrorApi(500, 'error_interno', 'x'));
    montar('/', e);
    expect(await screen.findByText('No pudimos cargar esta información.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await indicador('Dentro ahora')).toBeInTheDocument();
    expect(espia).toHaveBeenCalledTimes(2);
  });

  it('CA-9 tras registrar una entrada en otra pantalla, "Dentro ahora" refleja el cambio', async () => {
    montar('/', e);
    const antes = await indicador('Dentro ahora');
    await waitFor(() => expect(within(antes).getByText('5 / 40')).toBeInTheDocument());
    const u = userEvent.setup();
    await u.click(screen.getAllByRole('link', { name: 'Acceso' })[0]!);
    await u.type(await screen.findByLabelText('Placa'), 'XYZ34E{Enter}');
    await u.click(await screen.findByRole('button', { name: 'Registrar entrada' }));
    await screen.findByText('Entrada registrada · XYZ34E');
    await u.click(screen.getAllByRole('link', { name: 'Inicio' })[0]!);
    await waitFor(async () => expect(within(await indicador('Dentro ahora')).getByText('6 / 40')).toBeInTheDocument());
  });

  it('muestra el movimiento de hoy', async () => {
    conResumen({});
    montar('/', e);
    expect(await screen.findByText('Entradas 18 · Salidas 9')).toBeInTheDocument();
  });

  it('CA-10 los indicadores van en una cuadrícula de 2 columnas en móvil, sin anchos fijos', async () => {
    conResumen({});
    montar('/', e);
    const rejilla = (await indicador('Dentro ahora')).parentElement!;
    expect(rejilla.className).toMatch(/\bgrid-cols-2\b/);
    expect(rejilla.children).toHaveLength(4);
    expect(rejilla.closest('main')!.innerHTML).not.toMatch(/w-\[\d+px\]/);
  });

  it('el operador también ve el dashboard', async () => {
    await iniciarSesion(e, 'operador');
    conResumen({});
    montar('/', e);
    expect(await indicador('Dentro ahora')).toBeInTheDocument();
  });
});
