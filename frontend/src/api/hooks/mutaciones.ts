import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { obtenerApi } from '../index';
import type {
  AccesoEntrada, ClienteCrear, ClienteEditar, ConfiguracionEditar, MembresiaCrear, MotivoEntrada, MotoCrear, MotoEditar, PagoCrear,
  PlanCrear, PlanEditar, UsuarioCrear, UsuarioEditar,
} from '../client';

/** Invalida por recurso (primera posición de la clave). Tabla de la spec A-02 §4.1. */
export function invalidar(qc: QueryClient, recursos: string[]): Promise<unknown> {
  return Promise.all(recursos.map((r) => qc.invalidateQueries({ queryKey: [r] })));
}

function mutacion<V, R>(fn: (v: V) => Promise<R>, recursos: string[]) {
  return () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: fn, onSuccess: () => invalidar(qc, recursos) });
  };
}

const api = obtenerApi;

export const useRegistrarEntrada = mutacion((d: AccesoEntrada) => api().registrarEntrada(d), ['accesos', 'dashboard', 'motos']);
export const useRegistrarSalida = mutacion((d: AccesoEntrada) => api().registrarSalida(d), ['accesos', 'dashboard', 'motos']);

export const useCrearCliente = mutacion((d: ClienteCrear) => api().crearCliente(d), ['clientes', 'motos']);
export const useEditarCliente = mutacion((v: { id: string; datos: ClienteEditar }) => api().editarCliente(v.id, v.datos), ['clientes', 'motos']);
export const useCrearMoto = mutacion((d: MotoCrear) => api().crearMoto(d), ['clientes', 'motos']);
export const useEditarMoto = mutacion((v: { id: string; datos: MotoEditar }) => api().editarMoto(v.id, v.datos), ['clientes', 'motos']);

const porMembresia = ['membresias', 'clientes', 'pagos', 'dashboard'];
export const useCrearMembresia = mutacion((d: MembresiaCrear) => api().crearMembresia(d), porMembresia);
export const useCambiarPlanMembresia = mutacion((v: { id: string; plan_id: string }) => api().cambiarPlanMembresia(v.id, { plan_id: v.plan_id }), porMembresia);
export const useCancelarMembresia = mutacion((v: { id: string; datos: MotivoEntrada }) => api().cancelarMembresia(v.id, v.datos), porMembresia);

const porPago = ['pagos', 'membresias', 'clientes', 'dashboard'];
export const useRegistrarPago = mutacion((d: PagoCrear) => api().registrarPago(d), porPago);
export const useAnularPago = mutacion((v: { id: string; datos: MotivoEntrada }) => api().anularPago(v.id, v.datos), porPago);

export const useCrearPlan = mutacion((d: PlanCrear) => api().crearPlan(d), ['planes']);
export const useEditarPlan = mutacion((v: { id: string; datos: PlanEditar }) => api().editarPlan(v.id, v.datos), ['planes']);
export const useCrearUsuario = mutacion((d: UsuarioCrear) => api().crearUsuario(d), ['usuarios']);
export const useEditarUsuario = mutacion((v: { id: string; datos: UsuarioEditar }) => api().editarUsuario(v.id, v.datos), ['usuarios']);
export const useEditarConfiguracion = mutacion((d: ConfiguracionEditar) => api().editarConfiguracion(d), ['configuracion', 'membresias', 'dashboard']);
