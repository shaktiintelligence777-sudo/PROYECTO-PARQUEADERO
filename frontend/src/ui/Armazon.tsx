import { Banknote, History, IdCard, KeyRound, LayoutDashboard, LogOut, MoreHorizontal, ScanLine, Settings, Users, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Hoja } from './Hoja';
import { cx } from './cx';

export interface ArmazonProps {
  usuario: { nombre: string; rol: 'admin' | 'operador' };
  alCerrarSesion: () => void;
  /** Si se pasa, aparece la acción "Cambiar contraseña" en la barra lateral y en "Más". */
  alCambiarPassword?: () => void;
  children: ReactNode;
}

interface Destino { ruta: string; etiqueta: string; icono: LucideIcon; soloAdmin?: boolean }

const DESTINOS: Destino[] = [
  { ruta: '/', etiqueta: 'Inicio', icono: LayoutDashboard },
  { ruta: '/acceso', etiqueta: 'Acceso', icono: ScanLine },
  { ruta: '/clientes', etiqueta: 'Clientes', icono: Users },
  { ruta: '/membresias', etiqueta: 'Membresías', icono: IdCard },
  { ruta: '/pagos', etiqueta: 'Pagos', icono: Banknote },
  { ruta: '/historial', etiqueta: 'Historial', icono: History, soloAdmin: true },
  { ruta: '/configuracion', etiqueta: 'Configuración', icono: Settings, soloAdmin: true },
];
const INFERIOR = ['/', '/clientes', '/acceso', '/membresias'];

const foco = 'focus-visible:outline-info';

/** Layout de la app autenticada: navegación inferior en móvil y barra lateral desde `md`. */
export function Armazon({ usuario, alCerrarSesion, alCambiarPassword, children }: ArmazonProps) {
  const [masAbierto, setMasAbierto] = useState(false);
  const visibles = DESTINOS.filter((d) => !d.soloAdmin || usuario.rol === 'admin');
  const inferiores = INFERIOR.map((r) => visibles.find((d) => d.ruta === r)!);
  const mas = visibles.filter((d) => !INFERIOR.includes(d.ruta));

  return (
    <div className="min-h-screen bg-asfalto-50 text-asfalto-900">
      {/* Escritorio: barra lateral de 240 px */}
      <nav aria-label="Navegación lateral" className="fixed bottom-0 left-0 top-[var(--altura-banner,0px)] hidden w-60 flex-col bg-asfalto-900 p-4 text-blanco md:flex">
        <span className="mb-6 text-subtitulo">Parqueadero Las Bermúdez</span>
        <ul className="flex flex-1 flex-col gap-1">
          {visibles.map((d) => (
            <li key={d.ruta}>
              <NavLink
                to={d.ruta}
                end={d.ruta === '/'}
                className={({ isActive }) => cx('flex h-11 items-center gap-3 rounded-control px-3 text-cuerpo', isActive ? 'bg-senal-400 text-asfalto-900' : 'text-asfalto-200 hover:bg-asfalto-700')}
              >
                <d.icono aria-hidden="true" className="size-6" />
                {d.etiqueta}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="border-t border-asfalto-700 pt-3">
          <p className="truncate text-apoyo">{usuario.nombre}</p>
          <p className="mb-2 text-micro uppercase text-asfalto-300">{usuario.rol}</p>
          {alCambiarPassword && (
            <button type="button" onClick={alCambiarPassword} className="flex h-11 w-full items-center gap-3 rounded-control px-3 text-cuerpo text-asfalto-200 hover:bg-asfalto-700">
              <KeyRound aria-hidden="true" className="size-5" /> Cambiar contraseña
            </button>
          )}
          <button type="button" onClick={alCerrarSesion} className="flex h-11 w-full items-center gap-3 rounded-control px-3 text-cuerpo text-asfalto-200 hover:bg-asfalto-700">
            <LogOut aria-hidden="true" className="size-5" /> Cerrar sesión
          </button>
        </div>
      </nav>

      {/* Móvil: cabecera de 56 px */}
      <header className="flex h-14 items-center justify-between bg-asfalto-900 px-4 text-blanco md:hidden">
        <span className="min-w-0 truncate text-subtitulo">Parqueadero Las Bermúdez</span>
        <span className="truncate text-apoyo">{usuario.nombre}</span>
      </header>

      <main className="mx-auto max-w-contenido px-4 pb-24 pt-4 md:ml-60 md:px-6 md:pb-6 md:pt-6">{children}</main>

      {/* Móvil: navegación inferior de 64 px */}
      <nav
        aria-label="Navegación inferior"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-asfalto-200 bg-blanco md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid h-16 grid-cols-5">
          {inferiores.map((d) => {
            const central = d.ruta === '/acceso';
            return (
              <li key={d.ruta} className="flex items-center justify-center">
                <NavLink
                  to={d.ruta}
                  end={d.ruta === '/'}
                  className={({ isActive }) => cx(
                    'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 text-micro',
                    central ? 'size-14 rounded-full bg-senal-400 text-asfalto-900 shadow-flotante' : isActive ? 'text-asfalto-900' : 'text-asfalto-500',
                  )}
                >
                  <d.icono aria-hidden="true" className="size-6" />
                  {d.etiqueta}
                </NavLink>
              </li>
            );
          })}
          <li className="flex items-center justify-center">
            <button type="button" onClick={() => setMasAbierto(true)} className={cx('flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 text-micro text-asfalto-500', foco)}>
              <MoreHorizontal aria-hidden="true" className="size-6" />
              Más
            </button>
          </li>
        </ul>
      </nav>

      <Hoja abierta={masAbierto} alCerrar={() => setMasAbierto(false)} titulo="Más">
        <ul className="flex flex-col">
          {mas.map((d) => (
            <li key={d.ruta}>
              <NavLink to={d.ruta} onClick={() => setMasAbierto(false)} className="flex h-12 items-center gap-3 text-cuerpo text-asfalto-900">
                <d.icono aria-hidden="true" className="size-6 text-asfalto-500" />
                {d.etiqueta}
              </NavLink>
            </li>
          ))}
          {alCambiarPassword && (
            <li>
              <button type="button" onClick={() => { setMasAbierto(false); alCambiarPassword(); }} className="flex h-12 w-full items-center gap-3 text-cuerpo text-asfalto-900">
                <KeyRound aria-hidden="true" className="size-6 text-asfalto-500" /> Cambiar contraseña
              </button>
            </li>
          )}
          <li>
            <button type="button" onClick={() => { setMasAbierto(false); alCerrarSesion(); }} className="flex h-12 w-full items-center gap-3 text-cuerpo text-peligro-texto">
              <LogOut aria-hidden="true" className="size-6" /> Cerrar sesión
            </button>
          </li>
        </ul>
      </Hoja>
    </div>
  );
}
