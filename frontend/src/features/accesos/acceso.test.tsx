import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fijarApi } from '@/api';
import { RELOJ, crearEntorno, iniciarSesion, montar, type Entorno } from '@/test/montar';

let e: Entorno;
beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  // Fija solo Date: el reloj de la API mock es RELOJ, así los cronómetros de "Dentro" son exactos.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(RELOJ) });
  e = crearEntorno();
  await iniciarSesion(e);
});
afterEach(() => { fijarApi(null); vi.useRealTimers(); });

async function abrir(ruta = '/acceso') {
  montar(ruta, e);
  return screen.findByLabelText('Placa');
}
async function buscar(placa: string) {
  const campo = await screen.findByLabelText('Placa');
  const u = userEvent.setup();
  await u.clear(campo);
  await u.type(campo, placa);
  await u.click(screen.getByRole('button', { name: 'Buscar' }));
  return u;
}
const contadorDentro = () => screen.getByRole('radio', { name: /^Dentro/ }).textContent;

describe('P3 · registro de acceso', () => {
  it('CA-1 foco en la placa y "Buscar" deshabilitado hasta 4 caracteres', async () => {
    const campo = await abrir();
    expect(campo).toHaveFocus();
    const boton = screen.getByRole('button', { name: 'Buscar' });
    expect(boton).toBeDisabled();
    const u = userEvent.setup();
    await u.type(campo, 'ABC');
    expect(boton).toBeDisabled();
    await u.type(campo, '1');
    expect(boton).toBeEnabled();
  });

  it('CA-2 moto fuera con membresía activa: placa normalizada, cliente, insignia y botón, sin avisos', async () => {
    await abrir();
    await buscar('xyz-34e');
    const r = await screen.findByLabelText('Resultado de XYZ34E');
    expect(within(r).getByRole('img', { name: 'Placa XYZ34E' })).toBeInTheDocument();
    expect(within(r).getByText('María Gómez')).toBeInTheDocument();
    expect(within(r).getByText('Activa')).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: 'Registrar entrada' })).toBeInTheDocument();
    expect(within(r).queryByText(/vence pronto|vencida|no tiene membresía/i)).not.toBeInTheDocument();
  });

  it('CA-2 se normaliza abc-12d a ABC12D', async () => {
    await abrir();
    const u = await buscar('abc-12d');
    expect(screen.getByLabelText('Placa')).toHaveValue('ABC12D');
    expect(u).toBeDefined();
  });

  it('CA-3 registrar entrada: toast, campo vacío con foco y el contador de Dentro sube', async () => {
    await abrir();
    await waitFor(() => expect(contadorDentro()).toBe('Dentro (5)'));
    const u = await buscar('xyz-34e');
    await u.click(await screen.findByRole('button', { name: 'Registrar entrada' }));
    expect(await screen.findByText('Entrada registrada · XYZ34E')).toBeInTheDocument();
    const campo = screen.getByLabelText('Placa');
    expect(campo).toHaveValue('');
    await waitFor(() => expect(campo).toHaveFocus());
    expect(screen.queryByLabelText('Resultado de XYZ34E')).not.toBeInTheDocument();
    await waitFor(() => expect(contadorDentro()).toBe('Dentro (6)'));
  });

  it('CA-4 membresía vencida: aviso, enlace Registrar pago y entrada de todos modos', async () => {
    await abrir();
    const u = await buscar('VWX55P');
    expect(await screen.findByText('Membresía vencida. Puedes registrar la entrada y cobrar la renovación.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar pago' }).getAttribute('href')).toMatch(/^\/pagos\/nuevo\?membresia=/);
    await u.click(screen.getByRole('button', { name: 'Registrar entrada de todos modos' }));
    expect(await screen.findByText('Entrada registrada · VWX55P')).toBeInTheDocument();
  });

  it('CA-5 sin membresía: aviso y enlace Crear membresía', async () => {
    await abrir();
    await buscar('BCD77R');
    expect(await screen.findByText('Este cliente no tiene membresía.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Crear membresía' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar entrada de todos modos' })).toBeInTheDocument();
  });

  it('CA-6 por vencer: aviso y botón normal', async () => {
    await abrir();
    await buscar('PQR33L');
    expect(await screen.findByText('La membresía vence pronto.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar entrada' })).toBeInTheDocument();
  });

  it('CA-7 moto dentro: aviso "Dentro desde las" y salida con duración', async () => {
    await abrir();
    const u = await buscar('ABC12D');
    expect(await screen.findByText(/^Dentro desde las /)).toHaveTextContent(/^Dentro desde las \d{1,2}:\d{2} [ap]\. m\. \(01:35:00\)\.$/);
    await u.click(screen.getByRole('button', { name: 'Registrar salida' }));
    expect(await screen.findByText('Salida registrada · ABC12D · 1 h 35 min')).toBeInTheDocument();
  });

  it('CA-8 placa inexistente: estado vacío con enlace a nuevo cliente', async () => {
    await abrir();
    await buscar('ZZZ99Z');
    expect(await screen.findByText('No hay ninguna moto con la placa ZZZ99Z.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar cliente nuevo' })).toHaveAttribute('href', '/clientes/nuevo?placa=ZZZ99Z');
  });

  it('CA-9 moto_ya_dentro: toast de error y el resultado pasa a ofrecer salida', async () => {
    await abrir();
    const u = await buscar('XYZ34E');
    await screen.findByRole('button', { name: 'Registrar entrada' });
    await e.api.registrarEntrada({ placa: 'XYZ34E' }); // otro operador se adelantó
    await u.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(await screen.findByText('Esa moto ya está dentro del parqueadero.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Registrar salida' })).toBeInTheDocument();
  });

  it('CA-10 la lista Dentro va de la más antigua a la más reciente, con "Más de 24 h"', async () => {
    await abrir('/acceso?vista=dentro');
    const lista = await screen.findByRole('list', { name: 'Motos dentro' });
    const placas = within(lista).getAllByRole('img').map((i) => i.getAttribute('aria-label'));
    expect(placas).toEqual(['Placa MNO56F', 'Placa QRS78G', 'Placa STU44N', 'Placa ABC12D', 'Placa JKL22K']);
    const filas = within(lista).getAllByRole('listitem');
    expect(within(filas[0]!).getByText('Más de 24 h')).toBeInTheDocument();
    expect(within(lista).getAllByText('Más de 24 h')).toHaveLength(1);
    expect(screen.getByText('5 de 40 motos dentro')).toBeInTheDocument();
  });

  it('CA-11 salida desde Dentro pide confirmación; cancelar no cambia nada', async () => {
    await abrir('/acceso?vista=dentro');
    const lista = await screen.findByRole('list', { name: 'Motos dentro' });
    const fila = () => within(lista).getAllByRole('listitem').find((li) => within(li).queryByRole('img', { name: 'Placa JKL22K' }))!;
    const u = userEvent.setup();
    await u.click(within(fila()).getByRole('button', { name: 'Salida' }));
    expect(await screen.findByText('¿Registrar la salida de JKL22K?')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(within(lista).getAllByRole('listitem')).toHaveLength(5);

    await u.click(within(fila()).getByRole('button', { name: 'Salida' }));
    await u.click(await screen.findByRole('button', { name: 'Registrar salida' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Motos dentro' })).getAllByRole('listitem')).toHaveLength(4));
    expect(screen.queryByRole('img', { name: 'Placa JKL22K' })).not.toBeInTheDocument();
  });

  it('CA-12 filtro sin coincidencias y lista vacía', async () => {
    await abrir('/acceso?vista=dentro');
    await screen.findByRole('list', { name: 'Motos dentro' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Filtrar por placa' }), { target: { value: 'QQQ' } });
    expect(await screen.findByText('Ninguna moto dentro coincide con esa placa.', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('CA-12 sin motos dentro', async () => {
    for (const p of ['ABC12D', 'MNO56F', 'QRS78G', 'JKL22K', 'STU44N']) await e.api.registrarSalida({ placa: p });
    await abrir('/acceso?vista=dentro');
    expect(await screen.findByText('No hay motos dentro en este momento.')).toBeInTheDocument();
  });

  it('CA-13 sin anchos fijos y botón principal de al menos 64 px (h-16)', async () => {
    await abrir();
    await buscar('XYZ34E');
    const boton = await screen.findByRole('button', { name: 'Registrar entrada' });
    expect(boton.className).toMatch(/\bh-16\b/);
    expect(boton.className).toMatch(/\bw-full\b/);
    const pagina = boton.closest('main')!;
    expect(pagina.innerHTML).not.toMatch(/w-\[\d+px\]|min-w-\[\d{3,}px\]/);
  });

  it('CA-14 pulsar dos veces la entrada envía una sola petición', async () => {
    const espia = vi.spyOn(e.api, 'registrarEntrada');
    await abrir();
    await buscar('XYZ34E');
    const boton = await screen.findByRole('button', { name: 'Registrar entrada' });
    await act(async () => { fireEvent.click(boton); fireEvent.click(boton); });
    await screen.findByText('Entrada registrada · XYZ34E');
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it('solo teclado: placa, Enter, Enter', async () => {
    await abrir();
    const u = userEvent.setup();
    await u.keyboard('xyz34e{Enter}');
    await screen.findByRole('button', { name: 'Registrar entrada' });
    screen.getByRole('button', { name: 'Registrar entrada' }).focus();
    await u.keyboard('{Enter}');
    expect(await screen.findByText('Entrada registrada · XYZ34E')).toBeInTheDocument();
  });

  it('la pestaña activa vive en la URL', async () => {
    await abrir('/acceso?vista=dentro');
    expect(await screen.findByRole('radio', { name: /^Dentro/ })).toBeChecked();
  });
});

describe('Visitante diario', () => {
  it('muestra los dos botones del mismo tamaño cuando la placa no existe', async () => {
    await abrir();
    await buscar('ZZZ99Z');
    const enlace = await screen.findByRole('link', { name: 'Registrar cliente nuevo' });
    const boton = screen.getByRole('button', { name: 'Visitante diario' });
    expect(enlace.className).toContain('h-16');
    expect(boton.className).toContain('h-16');
  });

  it('exige marca y color, el nombre es opcional, y registra la entrada', async () => {
    await abrir();
    const u = await buscar('ZZZ99Z');
    await u.click(await screen.findByRole('button', { name: 'Visitante diario' }));
    await u.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(await screen.findByText('Escribe la marca.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el color.')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Marca'), 'Honda');
    await u.type(screen.getByLabelText('Color'), 'Rojo');
    await u.click(screen.getByRole('button', { name: 'Registrar entrada' }));
    expect(await screen.findByText('Entrada registrada · ZZZ99Z · Visitante diario')).toBeInTheDocument();
    expect(screen.getByLabelText('Placa')).toHaveValue('');
  });

  it('CA-12 la lista Dentro muestra el cronómetro de cada visitante diario que está dentro', async () => {
    await e.api.registrarEntradaCasual({ placa: 'ZZZ99Z', marca: 'Honda', color: 'Rojo', nombre: 'Luis' });
    await abrir('/acceso?vista=dentro');
    const lista = await screen.findByRole('list', { name: 'Motos dentro' });
    const fila = within(lista).getByRole('img', { name: 'Placa ZZZ99Z' }).closest('li')!;
    expect(within(fila).getByText('Casual')).toBeInTheDocument();
    expect(within(fila).getByText('00:00:00')).toBeInTheDocument();
  });

  it('aparece en "Dentro" y su salida se registra desde la búsqueda por placa', async () => {
    await e.api.registrarEntradaCasual({ placa: 'ZZZ99Z', marca: 'Honda', color: 'Rojo', nombre: 'Luis' });
    await abrir();
    const u = await buscar('zzz99z');
    const r = await screen.findByLabelText('Resultado de ZZZ99Z');
    expect(within(r).getByText('Luis')).toBeInTheDocument();
    expect(within(r).getByText('Visitante diario')).toBeInTheDocument();
    expect(within(r).queryByRole('link', { name: 'Ver cliente' })).not.toBeInTheDocument();
    await u.click(within(r).getByRole('button', { name: 'Registrar salida' }));
    expect(await screen.findByText(/^Salida registrada · ZZZ99Z/)).toBeInTheDocument();
  });
});
