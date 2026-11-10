import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Rol } from '@/api';
import { Esqueleto } from '@/ui';
import { useSesion } from '@/features/auth/ProveedorSesion';
import { PaginaSinPermiso } from './PaginaSinPermiso';

export function EsqueletoApp() {
  return (
    <div role="status" aria-label="Cargando" className="mx-auto max-w-contenido space-y-4 p-4">
      <Esqueleto className="h-14 w-full" />
      <Esqueleto className="h-32 w-full" />
      <Esqueleto className="h-32 w-full" />
    </div>
  );
}

export function RutaProtegida({ roles, children }: { roles?: Rol[]; children: ReactNode }) {
  const { estado, usuario } = useSesion();
  const ubicacion = useLocation();
  if (estado === 'cargando') return <EsqueletoApp />;
  if (estado === 'anonimo' || !usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  if (roles && !roles.includes(usuario.rol)) return <PaginaSinPermiso />;
  return <>{children}</>;
}
