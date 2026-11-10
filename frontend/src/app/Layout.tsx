import { Outlet } from 'react-router-dom';
import { isDemo } from '../api';
import { useAuth } from './auth';

export function DemoBanner() {
  if (!isDemo) return null;
  return (
    <div role="status" className="bg-amber-100 px-4 py-1 text-center text-sm text-amber-900">
      Modo demo: los datos son ficticios y se guardan solo en este navegador.
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DemoBanner />
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
        <span className="font-semibold">🏍️ Parqueadero</span>
        <span className="flex items-center gap-3 text-sm">
          {user?.nombre}
          <button onClick={() => void logout()} className="rounded border border-white/40 px-2 py-1 hover:bg-white/10">Salir</button>
        </span>
      </header>
      <main className="mx-auto max-w-5xl p-4"><Outlet /></main>
    </div>
  );
}
