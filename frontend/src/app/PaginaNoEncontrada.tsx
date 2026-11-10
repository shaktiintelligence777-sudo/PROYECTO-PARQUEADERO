import { Link } from 'react-router-dom';

export function PaginaNoEncontrada() {
  return (
    <main className="mx-auto max-w-[960px] p-4 md:p-6">
      <h1 className="text-titulo">Página no encontrada</h1>
      <Link className="mt-4 inline-block text-info underline" to="/">Volver al inicio</Link>
    </main>
  );
}
