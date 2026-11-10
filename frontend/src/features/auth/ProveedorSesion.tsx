import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerApi, type Usuario } from '@/api';
import { almacenSesion as almacenPorDefecto, type AlmacenSesion } from './almacenSesion';

export type EstadoSesion = 'cargando' | 'anonimo' | 'autenticado';
/** Por qué se llegó al login sin haber pulsado "Iniciar sesión": se muestra como aviso. */
export type MotivoLogin = 'sesion_vencida' | 'password_cambiada' | null;

interface Sesion {
  estado: EstadoSesion;
  usuario: Usuario | null;
  motivoLogin: MotivoLogin;
  iniciar(email: string, password: string): Promise<Usuario>;
  cerrar(motivo?: Exclude<MotivoLogin, 'sesion_vencida' | null>): Promise<void>;
}

const Ctx = createContext<Sesion | null>(null);

export function ProveedorSesion({ children, almacen = almacenPorDefecto }: { children: ReactNode; almacen?: AlmacenSesion }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [estado, setEstado] = useState<EstadoSesion>('cargando');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [motivoLogin, setMotivoLogin] = useState<MotivoLogin>(null);
  const arranque = useRef<Promise<void> | null>(null);

  const terminar = useCallback((motivo: MotivoLogin) => {
    almacen.borrar();
    obtenerApi().establecerToken(null);
    void qc.cancelQueries();
    qc.clear();
    setUsuario(null);
    setMotivoLogin(motivo);
    setEstado('anonimo');
  }, [almacen, qc]);

  // Restaurar la sesión al cargar. El refresh es de un solo uso: StrictMode ejecuta el efecto dos veces,
  // así que se comparte la misma promesa para no gastarlo dos veces.
  useEffect(() => {
    arranque.current ??= (async () => {
      const refresh = almacen.leer();
      if (!refresh) { setEstado('anonimo'); return; }
      try {
        const api = obtenerApi();
        const s = await api.refrescarSesion({ refresh_token: refresh });
        almacen.guardar(s.refresh_token);
        api.establecerToken(s.access_token);
        setUsuario(s.usuario);
        setEstado('autenticado');
      } catch {
        terminar('sesion_vencida');
      }
    })();
  }, [almacen, terminar]);

  // Un refresh fallido en cualquier llamada termina la sesión (lo avisa conSesion).
  useEffect(() => almacen.alExpirar(() => terminar('sesion_vencida')), [almacen, terminar]);

  const iniciar = useCallback(async (email: string, password: string) => {
    const api = obtenerApi();
    const s = await api.login({ email, password });
    almacen.guardar(s.refresh_token);
    api.establecerToken(s.access_token);
    qc.clear();
    setUsuario(s.usuario);
    setMotivoLogin(null);
    setEstado('autenticado');
    return s.usuario;
  }, [almacen, qc]);

  const cerrar = useCallback(async (motivo?: 'password_cambiada') => {
    const refresh = almacen.leer();
    navegar('/login', { replace: true });
    try { if (refresh) await obtenerApi().logout({ refresh_token: refresh }); } catch { /* aunque falle, la sesión local se cierra */ }
    terminar(motivo ?? null);
  }, [almacen, navegar, terminar]);

  const valor = useMemo(() => ({ estado, usuario, motivoLogin, iniciar, cerrar }), [estado, usuario, motivoLogin, iniciar, cerrar]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): Sesion {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return c;
}
