import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Usuario } from '../api';

interface AuthState { user: Usuario | null; loading: boolean; login(email: string, password: string): Promise<void>; logout(): Promise<void> }
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.me().then(setUser).finally(() => setLoading(false)); }, []);
  const login = useCallback(async (email: string, password: string) => setUser(await api.login(email, password)), []);
  const logout = useCallback(async () => { await api.logout(); setUser(null); }, []);
  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fuera de AuthProvider');
  return v;
}
