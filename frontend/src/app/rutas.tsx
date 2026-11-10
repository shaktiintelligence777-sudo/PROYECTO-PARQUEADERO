import { Link, Route, Routes } from 'react-router-dom';
import { Galeria } from './Galeria';
import { PaginaNoEncontrada } from './PaginaNoEncontrada';

export interface RutaApp { ruta: string; pantalla: string; rol: 'publico' | 'todos' | 'admin' }

/** Tabla de rutas de la spec A-01 §4.1. Las guardas de sesión y rol llegan en A-04. */
export const RUTAS: RutaApp[] = [
  { ruta: '/login', pantalla: 'P1 Login', rol: 'publico' },
  { ruta: '/', pantalla: 'P2 Dashboard', rol: 'todos' },
  { ruta: '/acceso', pantalla: 'P3 Registro de acceso', rol: 'todos' },
  { ruta: '/clientes', pantalla: 'P4 Lista de clientes', rol: 'todos' },
  { ruta: '/clientes/nuevo', pantalla: 'P5 Nuevo cliente', rol: 'todos' },
  { ruta: '/clientes/:id', pantalla: 'P4 Ficha del cliente', rol: 'todos' },
  { ruta: '/membresias', pantalla: 'P6 Membresías', rol: 'todos' },
  { ruta: '/pagos', pantalla: 'Lista de pagos', rol: 'todos' },
  { ruta: '/pagos/nuevo', pantalla: 'P7 Registrar pago', rol: 'todos' },
  { ruta: '/historial', pantalla: 'P8 Historial de accesos', rol: 'admin' },
  { ruta: '/configuracion', pantalla: 'P9 Configuración', rol: 'admin' },
];

function Provisional({ nombre }: { nombre: string }) {
  return (
    <main className="mx-auto max-w-[960px] p-4 md:p-6">
      <h1 className="text-titulo">{nombre}</h1>
      <p className="mt-2 text-apoyo text-asfalto-500">Página provisional.</p>
      <Link className="mt-4 inline-block text-info underline" to="/">Ir al inicio</Link>
    </main>
  );
}

export function RutasApp() {
  return (
    <Routes>
      {RUTAS.map((r) => <Route key={r.ruta} path={r.ruta} element={<Provisional nombre={r.pantalla} />} />)}
      {import.meta.env.DEV && <Route path="/galeria" element={<Galeria />} />}
      <Route path="*" element={<PaginaNoEncontrada />} />
    </Routes>
  );
}
