import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ui from '@/ui';
import {
  Aviso, Armazon, BannerDemo, Boton, Buscador, Campo, DialogoConfirmar, Elemento, Entrada, EntradaDinero, EntradaPlaca, EstadoError,
  GrupoOpciones, Hoja, Indicador, InsigniaEstado, ListaElementos, Paginador, Placa, ProveedorToasts, Tabla, Tarjeta, useToast,
} from '@/ui';

afterEach(() => { vi.useRealTimers(); });

describe('CA-1 exportaciones', () => {
  it.each([
    'Boton', 'BotonIcono', 'Campo', 'Entrada', 'AreaTexto', 'Selector', 'EntradaPlaca', 'EntradaDinero', 'Buscador', 'GrupoOpciones', 'Placa',
    'InsigniaEstado', 'Insignia', 'Tarjeta', 'Indicador', 'ListaElementos', 'Elemento', 'Tabla', 'Paginador', 'DatoEtiquetado', 'Aviso',
    'ProveedorToasts', 'useToast', 'Spinner', 'Esqueleto', 'EstadoVacio', 'EstadoError', 'Hoja', 'DialogoConfirmar', 'Armazon',
    'CabeceraPagina', 'BannerDemo',
  ])('CA-1 %s se importa desde @/ui', (nombre) => {
    expect((ui as Record<string, unknown>)[nombre]).toBeTruthy();
  });
});

describe('Boton', () => {
  it('CA-2 con cargando no dispara onClick y expone aria-busy', async () => {
    const onClick = vi.fn();
    render(<Boton cargando onClick={onClick}>Guardar</Boton>);
    const b = screen.getByRole('button');
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });
  it('dispara onClick normalmente', async () => {
    const onClick = vi.fn();
    render(<Boton onClick={onClick}>Guardar</Boton>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Campo', () => {
  it('CA-3 con error: aria-invalid y aria-describedby apuntan al mensaje', () => {
    render(<Campo etiqueta="Teléfono" error="Teléfono inválido"><Entrada /></Campo>);
    const input = screen.getByLabelText('Teléfono');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const id = input.getAttribute('aria-describedby')!;
    expect(document.getElementById(id)).toHaveTextContent('Teléfono inválido');
  });
  it('sin error no marca el control como inválido', () => {
    render(<Campo etiqueta="Nombre" ayuda="Ayuda"><Entrada /></Campo>);
    expect(screen.getByLabelText('Nombre')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Ayuda')).toBeInTheDocument();
  });
});

describe('EntradaPlaca y EntradaDinero', () => {
  function Placas({ alCambiar }: { alCambiar: (v: string) => void }) {
    const [v, setV] = useState('');
    return <EntradaPlaca aria-label="Placa" value={v} onChange={(x) => { setV(x); alCambiar(x); }} />;
  }
  it('CA-4 normaliza y limita a 7 caracteres', async () => {
    const al = vi.fn();
    render(<Placas alCambiar={al} />);
    const input = screen.getByLabelText('Placa');
    await userEvent.type(input, 'abc-12 d');
    expect(input).toHaveValue('ABC12D');
    expect(al).toHaveBeenLastCalledWith('ABC12D');
    await userEvent.type(input, 'xyz');
    expect((input as HTMLInputElement).value.length).toBeLessThanOrEqual(7);
  });
  function Dinero({ alCambiar }: { alCambiar: (v: number | null) => void }) {
    const [v, setV] = useState<number | null>(null);
    return <EntradaDinero aria-label="Monto" value={v} onChange={(x) => { setV(x); alCambiar(x); }} />;
  }
  it('CA-5 muestra $ 60.000, entrega 60000 e ignora letras', async () => {
    const al = vi.fn();
    render(<Dinero alCambiar={al} />);
    const input = screen.getByLabelText('Monto');
    await userEvent.type(input, 'a60000b');
    expect(input).toHaveValue('$ 60.000');
    expect(al).toHaveBeenLastCalledWith(60000);
    await userEvent.clear(input);
    expect(al).toHaveBeenLastCalledWith(null);
  });
});

describe('InsigniaEstado y Placa', () => {
  it.each([
    ['activa', 'Activa'], ['por_vencer', 'Por vencer'], ['vencida', 'Vencida'], ['cancelada', 'Cancelada'], [null, 'Sin membresía'],
  ] as const)('CA-6 %s → %s con icono', (estado, etiqueta) => {
    const { container } = render(<InsigniaEstado estado={estado} />);
    expect(screen.getByText(etiqueta)).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
  it('CA-6 con diasRestantes agrega "vence hoy"', () => {
    render(<InsigniaEstado estado="por_vencer" diasRestantes={0} />);
    expect(screen.getByText(/vence hoy/)).toBeInTheDocument();
  });
  it('CA-7 la placa es accesible como "Placa ABC12D"', () => {
    render(<Placa placa="ABC12D" />);
    expect(screen.getByRole('img', { name: 'Placa ABC12D' })).toBeInTheDocument();
  });
});

describe('Hoja y DialogoConfirmar', () => {
  function Demo() {
    const [abierta, setAbierta] = useState(false);
    return (
      <>
        <button onClick={() => setAbierta(true)}>Abrir</button>
        <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Mi hoja" pie={<Boton>Aceptar</Boton>}>
          <input aria-label="Dato" />
        </Hoja>
        <button>Fuera</button>
      </>
    );
  }
  it('CA-8 Escape cierra, devuelve el foco al disparador, bloquea el scroll y atrapa el Tab', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    await user.click(abrir);
    const dialogo = screen.getByRole('dialog', { name: 'Mi hoja' });
    expect(document.body.style.overflow).toBe('hidden');
    const dentro = within(dialogo);
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialogo.contains(document.activeElement)).toBe(true);
    }
    expect(dentro.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(abrir).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });
  it('se cierra con clic en el fondo', async () => {
    const user = userEvent.setup();
    render(<Demo />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const fondo = screen.getByRole('dialog').parentElement!;
    await user.pointer({ keys: '[MouseLeft]', target: fondo });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('CA-9 pedirMotivo: confirmar deshabilitado con menos de 5 caracteres y entrega el motivo', async () => {
    const user = userEvent.setup();
    const alConfirmar = vi.fn();
    render(<DialogoConfirmar abierta titulo="Anular pago" pedirMotivo textoConfirmar="Anular" alConfirmar={alConfirmar} alCancelar={() => undefined} />);
    const confirmar = screen.getByRole('button', { name: 'Anular' });
    expect(confirmar).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo'), 'abc');
    expect(confirmar).toBeDisabled();
    await user.type(screen.getByLabelText('Motivo'), 'de');
    expect(confirmar).toBeEnabled();
    await user.click(confirmar);
    expect(alConfirmar).toHaveBeenCalledWith('abcde');
  });
});

describe('Armazon', () => {
  const montar = (rol: 'admin' | 'operador') => render(
    <MemoryRouter><Armazon usuario={{ nombre: 'Ana', rol }} alCerrarSesion={() => undefined}><p>Contenido</p></Armazon></MemoryRouter>,
  );
  it('CA-10 operador no ve Historial ni Configuración', () => {
    montar('operador');
    expect(screen.queryAllByRole('link', { name: /Historial/ })).toHaveLength(0);
    expect(screen.queryAllByRole('link', { name: /Configuración/ })).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: /Clientes/ }).length).toBeGreaterThan(0);
  });
  it('CA-10 admin sí los ve', () => {
    montar('admin');
    expect(screen.getAllByRole('link', { name: /Historial/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Configuración/ }).length).toBeGreaterThan(0);
  });
  it('"Más" abre una hoja con Pagos y Cerrar sesión', async () => {
    const user = userEvent.setup();
    montar('operador');
    await user.click(screen.getByRole('button', { name: /Más/ }));
    const hoja = within(screen.getByRole('dialog', { name: 'Más' }));
    expect(hoja.getByRole('link', { name: /Pagos/ })).toBeInTheDocument();
    expect(hoja.getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument();
  });
});

describe('Toast y Buscador', () => {
  function Disparador() {
    const { mostrar } = useToast();
    return <button onClick={() => mostrar({ tono: 'peligro', mensaje: 'Falló' })}>Error</button>;
  }
  it('CA-11 el toast de error es role=alert y desaparece a los 6 s', () => {
    vi.useFakeTimers();
    render(<ProveedorToasts><Disparador /></ProveedorToasts>);
    act(() => { screen.getByRole('button', { name: 'Error' }).click(); });
    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
    act(() => { vi.advanceTimersByTime(5900); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('un toast normal dura 4 s', () => {
    vi.useFakeTimers();
    function Ok() { const { mostrar } = useToast(); return <button onClick={() => mostrar({ tono: 'exito', mensaje: 'Listo' })}>Ok</button>; }
    render(<ProveedorToasts><Ok /></ProveedorToasts>);
    act(() => { screen.getByRole('button', { name: 'Ok' }).click(); });
    expect(screen.getByRole('status')).toHaveTextContent('Listo');
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('CA-12 Buscador avisa una sola vez, 300 ms después de la última tecla', () => {
    vi.useFakeTimers();
    const al = vi.fn();
    render(<Buscador alBuscar={al} />);
    const input = screen.getByLabelText('Buscar');
    for (const t of ['j', 'jo', 'jos']) { fireEvent.change(input, { target: { value: t } }); act(() => { vi.advanceTimersByTime(100); }); }
    expect(al).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(199); });
    expect(al).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2); });
    expect(al).toHaveBeenCalledTimes(1);
    expect(al).toHaveBeenCalledWith('jos');
  });
  it('Buscador: el botón limpiar avisa de inmediato', async () => {
    const user = userEvent.setup();
    const al = vi.fn();
    render(<Buscador alBuscar={al} valorInicial="abc" />);
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(al).toHaveBeenCalledWith('');
    expect(screen.getByLabelText('Buscar')).toHaveValue('');
  });
});

describe('Paginador, listas y otros', () => {
  it('CA-13 en la página 1 de 7, Anterior está deshabilitado', () => {
    render(<Paginador pagina={1} paginas={7} alCambiar={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    expect(screen.getByText('Página 1 de 7')).toBeInTheDocument();
  });
  it('Paginador cambia de página', async () => {
    const al = vi.fn();
    render(<Paginador pagina={2} paginas={7} alCambiar={al} />);
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(al).toHaveBeenCalledWith(3);
  });
  it('GrupoOpciones es un radiogroup operable con flechas', async () => {
    const al = vi.fn();
    render(<GrupoOpciones etiqueta="Método" valor="efectivo" onChange={al} opciones={[{ valor: 'efectivo', etiqueta: 'Efectivo' }, { valor: 'otro', etiqueta: 'Otro' }]} />);
    expect(screen.getByRole('radiogroup', { name: 'Método' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Efectivo' })).toBeChecked();
    screen.getByRole('radio', { name: 'Efectivo' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(al).toHaveBeenCalledWith('otro');
  });
  it('Tabla, ListaElementos, Tarjeta, Indicador, Aviso y EstadoError', async () => {
    const alFila = vi.fn();
    const alReintentar = vi.fn();
    render(
      <MemoryRouter>
        <Tabla descripcion="Pagos" columnas={[{ clave: 'a', encabezado: 'A', celda: (f: { a: string }) => f.a }]} filas={[{ a: 'x' }]} claveFila={(f) => f.a} alClicFila={alFila} />
        <ListaElementos etiqueta="Lista"><Elemento titulo="Uno" subtitulo="sub" para="/clientes" /></ListaElementos>
        <Tarjeta><Tarjeta.Titulo>Título</Tarjeta.Titulo></Tarjeta>
        <Indicador etiqueta="Dentro" valor="5" enlace="/acceso" />
        <Aviso tono="peligro" titulo="Ojo">Detalle</Aviso>
        <EstadoError mensaje="Falló" alReintentar={alReintentar} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('columnheader', { name: 'A' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('cell', { name: 'x' }));
    expect(alFila).toHaveBeenCalledWith({ a: 'x' });
    expect(screen.getByRole('link', { name: /Uno/ })).toHaveAttribute('href', '/clientes');
    expect(screen.getByRole('link', { name: /Dentro/ })).toHaveAttribute('href', '/acceso');
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(alReintentar).toHaveBeenCalled();
  });
  it('BannerDemo pide confirmación antes de reiniciar', async () => {
    const user = userEvent.setup();
    const al = vi.fn();
    render(<BannerDemo alReiniciar={al} />);
    expect(screen.getByText('Modo demo: los datos son ficticios y se guardan solo en este navegador.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reiniciar datos' }));
    expect(screen.getByText('Se borrarán los cambios que hayas hecho en el demo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(al).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reiniciar datos' }));
    await user.click(screen.getByRole('button', { name: 'Reiniciar' }));
    expect(al).toHaveBeenCalledTimes(1);
  });
});
