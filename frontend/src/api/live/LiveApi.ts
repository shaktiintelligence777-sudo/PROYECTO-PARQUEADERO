import type {
  AccesoEntrada, AccesoRegistrado, ApiClient, ClienteCrear, ClienteDetalle, ClienteEditar, ClienteResumen, Configuracion,
  ConfiguracionEditar, ConsultaPlaca, DashboardResumen, Estancia, FiltrosClientes, FiltrosExportacion, FiltrosHistorial,
  FiltrosMembresias, FiltrosMotos, FiltrosNotificaciones, FiltrosPagos, FiltrosPaginacion, FiltrosPlanes, FiltrosUsuarios, Lista,
  LoginEntrada, Membresia, MembresiaCrear, MotivoEntrada, Moto, MotoConCliente, MotoCrear, MotoEditar, Notificacion, Pagina, Pago,
  PagoCrear, PagoRegistrado, PagoVistaPrevia, Plan, PlanCrear, PlanEditar, RefreshEntrada, Sesion, Usuario, UsuarioCrear,
  UsuarioEditar,
} from '../client';
import { ErrorApi } from '../client';
import { crearHttp, type Consulta, type Metodo, type OpcionesHttp } from './http';

const id = (valor: string) => encodeURIComponent(valor);

/**
 * Adaptador HTTP de `ApiClient` (C-01). Cada método llama a la operación del contrato con el mismo
 * `operationId`. No compensa diferencias con el contrato ni reintenta: la renovación ante 401 es de
 * `conSesion`.
 */
export class LiveApi implements ApiClient {
  private token: string | null = null;
  private readonly http: ReturnType<typeof crearHttp>;

  constructor(urlBase: string, opciones: OpcionesHttp = {}) {
    this.http = crearHttp(urlBase, opciones);
  }

  establecerToken(token: string | null): void { this.token = token; }

  private pedir<T>(metodo: Metodo, ruta: string, extra: { consulta?: object; cuerpo?: unknown; publica?: boolean } = {}): Promise<T> {
    return this.http<T>({
      metodo,
      ruta,
      consulta: extra.consulta as Consulta | undefined,
      cuerpo: extra.cuerpo,
      token: extra.publica ? null : this.token,
    });
  }

  // Autenticación: login, refresh y logout no llevan el token de acceso (`security: []` en el contrato).
  login(datos: LoginEntrada) { return this.pedir<Sesion>('POST', '/auth/login', { cuerpo: datos, publica: true }); }
  refrescarSesion(datos: RefreshEntrada) { return this.pedir<Sesion>('POST', '/auth/refresh', { cuerpo: datos, publica: true }); }
  logout(datos: RefreshEntrada) { return this.pedir<void>('POST', '/auth/logout', { cuerpo: datos, publica: true }); }
  usuarioActual() { return this.pedir<Usuario>('GET', '/auth/me'); }
  cambiarPassword(datos: { password_actual: string; password_nueva: string }) {
    return this.pedir<void>('PUT', '/auth/password', { cuerpo: datos });
  }

  listarUsuarios(filtros?: FiltrosUsuarios) { return this.pedir<Pagina<Usuario>>('GET', '/usuarios', { consulta: filtros }); }
  crearUsuario(datos: UsuarioCrear) { return this.pedir<Usuario>('POST', '/usuarios', { cuerpo: datos }); }
  editarUsuario(i: string, datos: UsuarioEditar) { return this.pedir<Usuario>('PATCH', `/usuarios/${id(i)}`, { cuerpo: datos }); }

  listarClientes(filtros?: FiltrosClientes) { return this.pedir<Pagina<ClienteResumen>>('GET', '/clientes', { consulta: filtros }); }
  crearCliente(datos: ClienteCrear) { return this.pedir<ClienteDetalle>('POST', '/clientes', { cuerpo: datos }); }
  obtenerCliente(i: string) { return this.pedir<ClienteDetalle>('GET', `/clientes/${id(i)}`); }
  editarCliente(i: string, datos: ClienteEditar) { return this.pedir<ClienteDetalle>('PATCH', `/clientes/${id(i)}`, { cuerpo: datos }); }

  listarMotos(filtros?: FiltrosMotos) { return this.pedir<Pagina<MotoConCliente>>('GET', '/motos', { consulta: filtros }); }
  crearMoto(datos: MotoCrear) { return this.pedir<Moto>('POST', '/motos', { cuerpo: datos }); }
  editarMoto(i: string, datos: MotoEditar) { return this.pedir<Moto>('PATCH', `/motos/${id(i)}`, { cuerpo: datos }); }

  listarPlanes(filtros?: FiltrosPlanes) { return this.pedir<Lista<Plan>>('GET', '/planes', { consulta: filtros }); }
  crearPlan(datos: PlanCrear) { return this.pedir<Plan>('POST', '/planes', { cuerpo: datos }); }
  editarPlan(i: string, datos: PlanEditar) { return this.pedir<Plan>('PATCH', `/planes/${id(i)}`, { cuerpo: datos }); }

  listarMembresias(filtros?: FiltrosMembresias) { return this.pedir<Pagina<Membresia>>('GET', '/membresias', { consulta: filtros }); }
  crearMembresia(datos: MembresiaCrear) { return this.pedir<Membresia>('POST', '/membresias', { cuerpo: datos }); }
  obtenerMembresia(i: string) { return this.pedir<Membresia>('GET', `/membresias/${id(i)}`); }
  cambiarPlanMembresia(i: string, datos: { plan_id: string }) {
    return this.pedir<Membresia>('PATCH', `/membresias/${id(i)}`, { cuerpo: datos });
  }
  cancelarMembresia(i: string, datos: MotivoEntrada) {
    return this.pedir<Membresia>('POST', `/membresias/${id(i)}/cancelar`, { cuerpo: datos });
  }
  listarPagosDeMembresia(i: string, filtros?: FiltrosPaginacion) {
    return this.pedir<Pagina<Pago>>('GET', `/membresias/${id(i)}/pagos`, { consulta: filtros });
  }

  listarPagos(filtros?: FiltrosPagos) { return this.pedir<Pagina<Pago>>('GET', '/pagos', { consulta: filtros }); }
  registrarPago(datos: PagoCrear) { return this.pedir<PagoRegistrado>('POST', '/pagos', { cuerpo: datos }); }
  previsualizarPago(datos: { membresia_id: string; periodos?: number }) {
    return this.pedir<PagoVistaPrevia>('POST', '/pagos/previsualizar', { cuerpo: datos });
  }
  anularPago(i: string, datos: MotivoEntrada) { return this.pedir<PagoRegistrado>('POST', `/pagos/${id(i)}/anular`, { cuerpo: datos }); }

  consultarPlaca(placa: string) { return this.pedir<ConsultaPlaca>('GET', '/accesos/consulta', { consulta: { placa } }); }
  registrarEntrada(datos: AccesoEntrada) { return this.pedir<AccesoRegistrado>('POST', '/accesos/entrada', { cuerpo: datos }); }
  registrarEntradaCasual(): Promise<AccesoRegistrado> {
    return Promise.reject(new ErrorApi(501, 'error_interno', 'El visitante diario solo está disponible en el demo.'));
  }
  registrarSalida(datos: AccesoEntrada) { return this.pedir<AccesoRegistrado>('POST', '/accesos/salida', { cuerpo: datos }); }
  listarMotosDentro(filtros?: { placa?: string }) {
    return this.pedir<{ items: Estancia[]; total: number; capacidad: number | null }>('GET', '/accesos/dentro', { consulta: filtros });
  }
  listarHistorialAccesos(filtros?: FiltrosHistorial) {
    return this.pedir<Pagina<Estancia>>('GET', '/accesos/historial', { consulta: filtros });
  }
  exportarHistorialAccesos(filtros: FiltrosExportacion) {
    return this.http<Blob>({
      metodo: 'GET', ruta: '/accesos/historial/export', consulta: filtros as Consulta, token: this.token, respuesta: 'blob',
    });
  }

  resumenDashboard() { return this.pedir<DashboardResumen>('GET', '/dashboard/resumen'); }
  listarNotificaciones(filtros?: FiltrosNotificaciones) {
    return this.pedir<Pagina<Notificacion>>('GET', '/notificaciones', { consulta: filtros });
  }
  obtenerConfiguracion() { return this.pedir<Configuracion>('GET', '/configuracion'); }
  editarConfiguracion(datos: ConfiguracionEditar) { return this.pedir<Configuracion>('PATCH', '/configuracion', { cuerpo: datos }); }
}

export function crearLiveApi(urlBase: string, opciones?: OpcionesHttp): ApiClient {
  return new LiveApi(urlBase, opciones);
}
