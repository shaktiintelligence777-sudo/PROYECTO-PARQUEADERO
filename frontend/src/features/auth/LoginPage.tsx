import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { isDemo } from '../../api';
import { DemoBanner } from '../../app/Layout';
import { useAuth } from '../../app/auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState(isDemo ? 'demo@parqueadero.app' : '');
  const [password, setPassword] = useState(isDemo ? 'demo1234' : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try { await login(email, password); } catch (err) { setError(err instanceof Error ? err.message : 'Error al iniciar sesión'); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <DemoBanner />
      <form onSubmit={onSubmit} className="mx-auto mt-16 w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Iniciar sesión</h1>
        <label className="block text-sm">Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm">Contraseña
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded bg-slate-900 py-2 text-white disabled:opacity-60">{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
