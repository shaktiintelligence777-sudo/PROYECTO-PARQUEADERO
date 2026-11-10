import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Armazon } from '@/ui';
import { HojaCambiarPassword } from '@/features/auth/HojaCambiarPassword';
import { useSesion } from '@/features/auth/ProveedorSesion';

/** Armazón de la app autenticada, conectado con la sesión. */
export function DisposicionApp() {
  const { usuario, cerrar } = useSesion();
  const [cambiando, setCambiando] = useState(false);
  if (!usuario) return null;
  return (
    <Armazon usuario={usuario} alCerrarSesion={() => void cerrar()} alCambiarPassword={() => setCambiando(true)}>
      <Outlet />
      <HojaCambiarPassword abierta={cambiando} alCerrar={() => setCambiando(false)} alCambiar={() => { setCambiando(false); void cerrar('password_cambiada'); }} />
    </Armazon>
  );
}
