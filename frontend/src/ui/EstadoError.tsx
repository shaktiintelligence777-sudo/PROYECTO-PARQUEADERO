import { AlertTriangle } from 'lucide-react';
import { Boton } from './Boton';
import { cx } from './cx';

export function EstadoError({ mensaje, alReintentar, className }: { mensaje: string; alReintentar?: () => void; className?: string }) {
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-2 rounded-tarjeta bg-peligro-suave p-8 text-center text-peligro-texto', className)}>
      <AlertTriangle aria-hidden="true" className="size-10" />
      <p className="text-subtitulo">{mensaje}</p>
      {alReintentar && <Boton variante="secundario" onClick={alReintentar}>Reintentar</Boton>}
    </div>
  );
}
