import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { obtenerApi } from '../index';
import type {
  FiltrosClientes, FiltrosHistorial, FiltrosMembresias, FiltrosMotos, FiltrosNotificaciones, FiltrosPagos, FiltrosPaginacion,
  FiltrosPlanes, FiltrosUsuarios,
} from '../client';
import { claves } from '../claves';

const lista = { placeholderData: keepPreviousData } as const;

export const useClientes = (f?: FiltrosClientes) => useQuery({ queryKey: claves.clientes(f), queryFn: () => obtenerApi().listarClientes(f), ...lista });
export const useCliente = (id: string) => useQuery({ queryKey: claves.cliente(id), queryFn: () => obtenerApi().obtenerCliente(id) });
export const useMotos = (f?: FiltrosMotos) => useQuery({ queryKey: claves.motos(f), queryFn: () => obtenerApi().listarMotos(f), ...lista });
export const usePlanes = (f?: FiltrosPlanes) => useQuery({ queryKey: claves.planes(f), queryFn: () => obtenerApi().listarPlanes(f) });
export const useMembresias = (f?: FiltrosMembresias) => useQuery({ queryKey: claves.membresias(f), queryFn: () => obtenerApi().listarMembresias(f), ...lista });
export const useMembresia = (id: string) => useQuery({ queryKey: claves.membresia(id), queryFn: () => obtenerApi().obtenerMembresia(id) });
export const usePagos = (f?: FiltrosPagos) => useQuery({ queryKey: claves.pagos(f), queryFn: () => obtenerApi().listarPagos(f), ...lista });
export const usePagosDeMembresia = (id: string, f?: FiltrosPaginacion) =>
  useQuery({ queryKey: claves.pagosDeMembresia(id, f), queryFn: () => obtenerApi().listarPagosDeMembresia(id, f) });
export const useVistaPreviaPago = (d: { membresia_id: string; periodos?: number }, habilitado = true) =>
  useQuery({ queryKey: claves.vistaPreviaPago(d), queryFn: () => obtenerApi().previsualizarPago(d), enabled: habilitado });
export const useConsultaPlaca = (placa: string, habilitado = true) =>
  useQuery({ queryKey: claves.placa(placa), queryFn: () => obtenerApi().consultarPlaca(placa), enabled: habilitado, retry: false });
/** `refrescarCadaMs` activa el sondeo periódico (la lista "Dentro" se refresca cada 30 s). */
export const useMotosDentro = (f?: { placa?: string }, refrescarCadaMs?: number) =>
  useQuery({ queryKey: claves.dentro(f), queryFn: () => obtenerApi().listarMotosDentro(f), ...lista, refetchInterval: refrescarCadaMs });
export const useHistorialAccesos = (f?: FiltrosHistorial) =>
  useQuery({ queryKey: claves.historial(f), queryFn: () => obtenerApi().listarHistorialAccesos(f), ...lista });
export const useResumenDashboard = () => useQuery({ queryKey: claves.dashboard, queryFn: () => obtenerApi().resumenDashboard() });
export const useUsuarios = (f?: FiltrosUsuarios) => useQuery({ queryKey: claves.usuarios(f), queryFn: () => obtenerApi().listarUsuarios(f), ...lista });
export const useNotificaciones = (f?: FiltrosNotificaciones) =>
  useQuery({ queryKey: claves.notificaciones(f), queryFn: () => obtenerApi().listarNotificaciones(f), ...lista });
export const useConfiguracion = () => useQuery({ queryKey: claves.configuracion, queryFn: () => obtenerApi().obtenerConfiguracion() });
