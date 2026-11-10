import type {
  Cliente, Estancia, Membresia, Moto, NuevaMembresia, NuevaMoto, NuevoCliente, NuevoPago,
  Pago, Plan, Resumen, Usuario,
} from './types';

/** Interfaz común: la implementan el adaptador mock (demo) y el live (backend). */
export interface ApiClient {
  login(email: string, password: string): Promise<Usuario>;
  logout(): Promise<void>;
  me(): Promise<Usuario | null>;

  listClientes(q?: string): Promise<Cliente[]>;
  getCliente(id: string): Promise<Cliente>;
  crearCliente(data: NuevoCliente): Promise<Cliente>;
  actualizarCliente(id: string, data: Partial<NuevoCliente>): Promise<Cliente>;

  listMotos(filtro?: { placa?: string; cliente_id?: string }): Promise<Moto[]>;
  crearMoto(data: NuevaMoto): Promise<Moto>;

  listPlanes(): Promise<Plan[]>;

  listMembresias(filtro?: { estado?: string; cliente_id?: string }): Promise<Membresia[]>;
  crearMembresia(data: NuevaMembresia): Promise<Membresia>;

  listPagos(membresia_id?: string): Promise<Pago[]>;
  registrarPago(data: NuevoPago): Promise<{ pago: Pago; membresia: Membresia }>;

  registrarEntrada(placa: string): Promise<Estancia>;
  registrarSalida(placa: string): Promise<Estancia>;
  listDentro(): Promise<Estancia[]>;
  historialAccesos(): Promise<Estancia[]>;

  resumen(): Promise<Resumen>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
