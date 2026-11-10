import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, fijarApi } from '@/api';
import { crearEntorno, montar, type Entorno } from '@/test/montar';
import { CLAVE_REFRESH } from './almacenSesion';

const ADMIN = ['demo@parqueadero.app', 'demo1234'] as const;
const OPERADOR = ['operador@parqueadero.app', 'demo1234'] as const;

async function entrar(email: string, password: string) {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Email'), email);
  await u.type(screen.getByLabelText('Contraseña'), password);
  await u.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  return u;
}

let e: Entorno;
beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); e = crearEntorno(); });
afterEach(() => { fijarApi(null); });

describe('login (A-04)', () => {
  it('CA-1 enviar vacío muestra errores y no llama a la API', async () => {
    const espia = vi.spyOn(e.api, 'login');
    montar('/login', e);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Escribe tu email.')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument();
    expect(espia).not.toHaveBeenCalled();
  });

  it('CA-2 admin llega a / y operador a /acceso', async () => {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    expect(await screen.findByRole('heading', { name: 'P2 Dashboard' })).toBeInTheDocument();
  });

  it('CA-2 operador llega a /acceso', async () => {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...OPERADOR);
    expect(await screen.findByRole('heading', { name: 'P3 Registro de acceso' })).toBeInTheDocument();
  });

  it('CA-3 credenciales inválidas: mensaje, contraseña vacía con foco y email conservado', async () => {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar('demo@parqueadero.app', 'mala-clave');
    expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
    const pass = screen.getByLabelText('Contraseña');
    expect(pass).toHaveValue('');
    await waitFor(() => expect(pass).toHaveFocus());
    expect(screen.getByLabelText('Email')).toHaveValue('demo@parqueadero.app');
  });

  it('CA-4 demasiados intentos', async () => {
    vi.spyOn(e.api, 'login').mockRejectedValue(new ErrorApi(429, 'demasiados_intentos', 'x'));
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    expect(await screen.findByText('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.')).toBeInTheDocument();
  });

  it('CA-11 "Usar estos datos" rellena los campos sin enviar', async () => {
    const espia = vi.spyOn(e.api, 'login');
    montar('/login', e);
    await userEvent.click(await screen.findByRole('button', { name: 'Usar estos datos' }));
    expect(screen.getByLabelText('Email')).toHaveValue('demo@parqueadero.app');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('demo1234');
    expect(espia).not.toHaveBeenCalled();
  });

  it('el botón mostrar contraseña cambia el type y el aria-label', async () => {
    montar('/login', e);
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar contraseña' }));
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar contraseña' })).toBeInTheDocument();
  });
});

describe('guardas y sesión (A-04)', () => {
  it('CA-5 sin sesión /clientes va a /login y tras entrar vuelve a /clientes', async () => {
    montar('/clientes', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    expect(await screen.findByRole('heading', { name: 'P4 Lista de clientes' })).toBeInTheDocument();
  });

  it.each(['/configuracion', '/historial'])('CA-6 operador en %s ve sin permiso', async (ruta) => {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...OPERADOR);
    await screen.findByRole('heading', { name: 'P3 Registro de acceso' });
    // navegación interna: volvemos a montar en la ruta con la sesión ya iniciada
    const { unmount } = montar(ruta, e);
    expect(await screen.findByText('No tienes permiso para ver esta página.')).toBeInTheDocument();
    unmount();
  });

  it('CA-7 una recarga con refresh guardado sigue autenticada, mostrando esqueleto y no el login', async () => {
    const primero = montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    await screen.findByRole('heading', { name: 'P2 Dashboard' });
    primero.unmount();
    // "recarga": nueva API (sin token en memoria), mismos storages
    const e2 = crearEntorno();
    montar('/clientes', e2);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'P4 Lista de clientes' })).toBeInTheDocument();
  });

  it('CA-9 un refresh que falla muestra el login con sesión vencida', async () => {
    window.sessionStorage.setItem(CLAVE_REFRESH, 'token-invalido');
    montar('/clientes', e);
    expect(await screen.findByText('Tu sesión venció. Inicia sesión otra vez.')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(CLAVE_REFRESH)).toBeNull();
  });

  it('CA-10 cerrar sesión limpia sessionStorage y caché y muestra el login', async () => {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    await screen.findByRole('heading', { name: 'P2 Dashboard' });
    e.qc.setQueryData(['x'], 1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0]!);
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem(CLAVE_REFRESH)).toBeNull();
    expect(e.qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it('CA-10 cierra la sesión aunque logout falle', async () => {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    await screen.findByRole('heading', { name: 'P2 Dashboard' });
    vi.spyOn(e.api, 'logout').mockRejectedValue(new Error('red'));
    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar sesión' })[0]!);
    expect(await screen.findByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('CA-13 ningún token en localStorage', async () => {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    await screen.findByRole('heading', { name: 'P2 Dashboard' });
    const refresh = window.sessionStorage.getItem(CLAVE_REFRESH)!;
    expect(refresh).toBeTruthy();
    for (let i = 0; i < window.localStorage.length; i++) {
      const v = window.localStorage.getItem(window.localStorage.key(i)!)!;
      expect(v).not.toContain(refresh);
      expect(window.localStorage.key(i)).not.toMatch(/token|sesion/i);
    }
  });
});

describe('cambiar contraseña (A-04)', () => {
  async function abrir() {
    montar('/login', e);
    await screen.findByRole('button', { name: 'Iniciar sesión' });
    await entrar(...ADMIN);
    await screen.findByRole('heading', { name: 'P2 Dashboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    return screen.getByRole('dialog');
  }

  it('CA-12 confirmación distinta', async () => {
    const d = await abrir();
    const u = userEvent.setup();
    await u.type(within(d).getByLabelText('Contraseña actual'), 'demo1234');
    await u.type(within(d).getByLabelText('Contraseña nueva'), 'nueva1234');
    await u.type(within(d).getByLabelText('Repite la contraseña nueva'), 'otra1234');
    await u.click(within(d).getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await within(d).findByText('Las contraseñas no coinciden.')).toBeInTheDocument();
  });

  it('CA-12 password_incorrecta', async () => {
    const d = await abrir();
    const u = userEvent.setup();
    await u.type(within(d).getByLabelText('Contraseña actual'), 'equivocada1');
    await u.type(within(d).getByLabelText('Contraseña nueva'), 'nueva1234');
    await u.type(within(d).getByLabelText('Repite la contraseña nueva'), 'nueva1234');
    await u.click(within(d).getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await within(d).findByText('La contraseña actual no es correcta.')).toBeInTheDocument();
  });

  it('CA-12 correcto: cierra la sesión con el aviso de contraseña cambiada', async () => {
    const d = await abrir();
    const u = userEvent.setup();
    await u.type(within(d).getByLabelText('Contraseña actual'), 'demo1234');
    await u.type(within(d).getByLabelText('Contraseña nueva'), 'nueva1234');
    await u.type(within(d).getByLabelText('Repite la contraseña nueva'), 'nueva1234');
    await u.click(within(d).getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText('Contraseña cambiada. Inicia sesión con la nueva.')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(CLAVE_REFRESH)).toBeNull();
  });
});

