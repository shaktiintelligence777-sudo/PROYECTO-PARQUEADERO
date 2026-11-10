import { Link } from 'react-router-dom';

export function PaginaSinPermiso() {
  return (
    <section className="mx-auto max-w-hoja py-10 text-center">
      <h1 className="text-titulo">No tienes permiso para ver esta página.</h1>
      <Link to="/" className="mt-6 inline-flex h-11 items-center rounded-control bg-senal-400 px-4 text-cuerpo text-asfalto-900">Ir al inicio</Link>
    </section>
  );
}
