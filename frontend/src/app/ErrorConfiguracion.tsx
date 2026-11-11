import { EstadoError } from '@/ui';

/** Se muestra en lugar de la app cuando falta configuración (C-01, regla 1). No hace peticiones. */
export function ErrorConfiguracion({ mensaje }: { mensaje: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <EstadoError mensaje={mensaje} />
    </main>
  );
}
