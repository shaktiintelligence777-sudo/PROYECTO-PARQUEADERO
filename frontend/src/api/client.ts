import type { components, operations } from './tipos';

type Esq = components['schemas'];

// Alias legibles de los esquemas del contrato.
export type CodigoError = Esq['CodigoError'];
export type Sesion = Esq['Sesion'];
export type Usuario = Esq['Usuario'];
export type UsuarioCrear = Esq['UsuarioCrear'];
export type UsuarioEditar = Esq['UsuarioEditar'];
export type Rol = Esq['Rol'];
export type ClienteResumen = Esq['ClienteResumen'];
export type ClienteDetalle = Esq['ClienteDetalle'];
export type ClienteCrear = Esq['ClienteCrear'];
export type ClienteEditar = Esq['ClienteEditar'];
export type ClienteRef = Esq['ClienteRef'];
export type Moto = Esq['Moto'];
export type MotoConCliente = Esq['MotoConCliente'];
export type MotoCrear = Esq['MotoCrear'] & { cliente_id: string };
export type MotoEditar = Esq['MotoEditar'];
export type Plan = Esq['Plan'];
export type PlanCrear = Esq['PlanCrear'];
export type PlanEditar = Esq['PlanEditar'];
export type Membresia = Esq['Membresia'];
export type MembresiaResumen = Esq['MembresiaResumen'];
export type MembresiaCrear = Esq['MembresiaCrear'];
export type EstadoMembresia = Esq['EstadoMembresia'];
export type MetodoPago = Esq['MetodoPago'];
export type Pago = Esq['Pago'];
// openapi-typescript marca como obligatorios los campos con default; en la petición son opcionales.
export type PagoCrear = Omit<Esq['PagoCrear'], 'periodos'> & { periodos?: number };
export type PagoVistaPrevia = Esq['PagoVistaPrevia'];
export type PagoRegistrado = Esq['PagoRegistrado'];
export type Estancia = Esq['Estancia'];
export type Advertencia = Esq['Advertencia'];
export type ConsultaPlaca = Esq['ConsultaPlaca'];
export type AccesoRegistrado = Esq['AccesoRegistrado'];
export type DashboardResumen = Esq['DashboardResumen'];
export type Notificacion = Esq['Notificacion'];
export type Configuracion = Esq['Configuracion'];
export type ConfiguracionEditar = Esq['ConfiguracionEditar'];
export type MotivoEntrada = Esq['MotivoEntrada'];
export type LoginEntrada = Esq['LoginEntrada'];
export type RefreshEntrada = Esq['RefreshEntrada'];
export type AccesoEntrada = Esq['AccesoEntrada'];

export type Pagina<T> = Esq['Paginacion'] & { items: T[] };
export interface Lista<T> { items: T[] }

type Consulta<K extends keyof operations> = operations[K] extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;
export type FiltrosUsuarios = Consulta<'listarUsuarios'>;
export type FiltrosClientes = Consulta<'listarClientes'>;
export type FiltrosMotos = Consulta<'listarMotos'>;
export type FiltrosPlanes = Consulta<'listarPlanes'>;
export type FiltrosMembresias = Consulta<'listarMembresias'>;
export type FiltrosPagos = Consulta<'listarPagos'>;
export type FiltrosPaginacion = { pagina?: number; por_pagina?: number };
export type FiltrosHistorial = Consulta<'listarHistorialAccesos'>;
export type FiltrosExportacion = Consulta<'exportarHistorialAccesos'>;
export type FiltrosNotificaciones = Consulta<'listarNotificaciones'>;

export interface DetalleError { campo: string; mensaje: string }

/** Todo fallo de cualquier adaptador se lanza como ErrorApi. */
export class ErrorApi extends Error {
  readonly codigo: CodigoError;
  readonly status: number;
  readonly detalles?: DetalleError[];
  constructor(status: number, codigo: CodigoError, mensaje: string, detalles?: DetalleError[]) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
  get mensaje(): string { return this.message; }
}

/** Un método por operación del contrato, con el mismo nombre que su operationId. */
export interface ApiClient {
  /** Token de acceso que usan las siguientes llamadas (null = sin sesión). */
  establecerToken(token: string | null): void;

  login(datos: LoginEntrada): Promise<Sesion>;
  refrescarSesion(datos: RefreshEntrada): Promise<Sesion>;
  logout(datos: RefreshEntrada): Promise<void>;
  usuarioActual(): Promise<Usuario>;
  cambiarPassword(datos: { password_actual: string; password_nueva: string }): Promise<void>;

  listarUsuarios(filtros?: FiltrosUsuarios): Promise<Pagina<Usuario>>;
  crearUsuario(datos: UsuarioCrear): Promise<Usuario>;
  editarUsuario(id: string, datos: UsuarioEditar): Promise<Usuario>;

  listarClientes(filtros?: FiltrosClientes): Promise<Pagina<ClienteResumen>>;
  crearCliente(datos: ClienteCrear): Promise<ClienteDetalle>;
  obtenerCliente(id: string): Promise<ClienteDetalle>;
  editarCliente(id: string, datos: ClienteEditar): Promise<ClienteDetalle>;

  listarMotos(filtros?: FiltrosMotos): Promise<Pagina<MotoConCliente>>;
  crearMoto(datos: MotoCrear): Promise<Moto>;
  editarMoto(id: string, datos: MotoEditar): Promise<Moto>;

  listarPlanes(filtros?: FiltrosPlanes): Promise<Lista<Plan>>;
  crearPlan(datos: PlanCrear): Promise<Plan>;
  editarPlan(id: string, datos: PlanEditar): Promise<Plan>;

  listarMembresias(filtros?: FiltrosMembresias): Promise<Pagina<Membresia>>;
  crearMembresia(datos: MembresiaCrear): Promise<Membresia>;
  obtenerMembresia(id: string): Promise<Membresia>;
  cambiarPlanMembresia(id: string, datos: { plan_id: string }): Promise<Membresia>;
  cancelarMembresia(id: string, datos: MotivoEntrada): Promise<Membresia>;
  listarPagosDeMembresia(id: string, filtros?: FiltrosPaginacion): Promise<Pagina<Pago>>;

  listarPagos(filtros?: FiltrosPagos): Promise<Pagina<Pago>>;
  registrarPago(datos: PagoCrear): Promise<PagoRegistrado>;
  previsualizarPago(datos: { membresia_id: string; periodos?: number }): Promise<PagoVistaPrevia>;
  anularPago(id: string, datos: MotivoEntrada): Promise<PagoRegistrado>;

  consultarPlaca(placa: string): Promise<ConsultaPlaca>;
  registrarEntrada(datos: AccesoEntrada): Promise<AccesoRegistrado>;
  registrarSalida(datos: AccesoEntrada): Promise<AccesoRegistrado>;
  listarMotosDentro(filtros?: { placa?: string }): Promise<{ items: Estancia[]; total: number; capacidad: number | null }>;
  listarHistorialAccesos(filtros?: FiltrosHistorial): Promise<Pagina<Estancia>>;
  exportarHistorialAccesos(filtros: FiltrosExportacion): Promise<Blob>;

  resumenDashboard(): Promise<DashboardResumen>;
  listarNotificaciones(filtros?: FiltrosNotificaciones): Promise<Pagina<Notificacion>>;
  obtenerConfiguracion(): Promise<Configuracion>;
  editarConfiguracion(datos: ConfiguracionEditar): Promise<Configuracion>;
}
