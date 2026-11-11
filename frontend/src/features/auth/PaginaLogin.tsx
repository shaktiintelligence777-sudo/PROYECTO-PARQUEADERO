import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ErrorApi } from '@/api';
import { DEMO_EN_BUILD, entorno } from '@/lib/entorno';
import { Aviso, Boton, Campo, Entrada, Placa } from '@/ui';
import { CampoPassword } from './CampoPassword';
import { useSesion } from './ProveedorSesion';

const EMAIL_DEMO = 'demo@parqueadero.app';
const PASSWORD_DEMO = 'demo1234';
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MENSAJES_ERROR: Record<string, string> = {
  credenciales_invalidas: 'Email o contraseña incorrectos.',
  demasiados_intentos: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
};

/** Ruta a la que se va tras entrar: el origen guardado por la guarda o el inicio de su rol. */
export function destinoTrasLogin(desde: string | undefined, rol: 'admin' | 'operador'): string {
  return desde && desde !== '/login' ? desde : rol === 'admin' ? '/' : '/acceso';
}

export function PaginaLogin() {
  const { estado, usuario, motivoLogin, iniciar } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const desde = (ubicacion.state as { desde?: string } | null)?.desde;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<{ email?: string; password?: string }>({});
  const [errorApi, setErrorApi] = useState('');
  const [enviando, setEnviando] = useState(false);
  const refEmail = useRef<HTMLInputElement>(null);
  const refPassword = useRef<HTMLInputElement>(null);
  const enfocarPassword = useRef(false);

  useEffect(() => {
    if (enfocarPassword.current) { refPassword.current?.focus(); enfocarPassword.current = false; }
  });

  if (estado === 'autenticado' && usuario) return <Navigate to={destinoTrasLogin(desde, usuario.rol)} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const nuevos: { email?: string; password?: string } = {};
    if (!email.trim()) nuevos.email = 'Escribe tu email.';
    else if (!RE_EMAIL.test(email.trim())) nuevos.email = 'Ese email no parece válido.';
    if (!password) nuevos.password = 'Escribe tu contraseña.';
    setErrores(nuevos);
    setErrorApi('');
    if (nuevos.email) { refEmail.current?.focus(); return; }
    if (nuevos.password) { refPassword.current?.focus(); return; }

    setEnviando(true);
    try {
      const u = await iniciar(email.trim(), password);
      setPassword('');
      navegar(destinoTrasLogin(desde, u.rol), { replace: true });
    } catch (err) {
      setPassword(''); // la contraseña no se conserva tras un error
      enfocarPassword.current = true;
      setErrorApi(err instanceof ErrorApi ? (MENSAJES_ERROR[err.codigo] ?? 'No pudimos iniciar sesión. Inténtalo de nuevo.') : 'No pudimos iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-tarjeta bg-blanco p-6 shadow-tarjeta">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Placa placa="ABC12D" tamano="lg" />
          <h1 className="text-titulo text-asfalto-900">Parqueadero</h1>
        </div>
        {motivoLogin === 'sesion_vencida' && <Aviso tono="info" className="mb-4">Tu sesión venció. Inicia sesión otra vez.</Aviso>}
        {motivoLogin === 'password_cambiada' && <Aviso tono="exito" className="mb-4">Contraseña cambiada. Inicia sesión con la nueva.</Aviso>}
        <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-4">
          <Campo etiqueta="Email" error={errores.email}>
            <Entrada ref={refEmail} type="email" autoComplete="username" placeholder="nombre@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <CampoPassword ref={refPassword} etiqueta="Contraseña" autoComplete="current-password" value={password} onChange={setPassword} error={errores.password} />
          {errorApi && <Aviso tono="peligro">{errorApi}</Aviso>}
          <Boton type="submit" tamano="lg" anchoCompleto cargando={enviando}>Iniciar sesión</Boton>
        </form>
        {DEMO_EN_BUILD && entorno.modo === 'mock' && (
          <Aviso tono="info" className="mt-6" titulo="Usuario de prueba:">
            <p>{EMAIL_DEMO}</p>
            <p>Contraseña: {PASSWORD_DEMO}</p>
            <Boton variante="secundario" className="mt-2" onClick={() => { setEmail(EMAIL_DEMO); setPassword(PASSWORD_DEMO); setErrores({}); setErrorApi(''); }}>Usar estos datos</Boton>
          </Aviso>
        )}
      </div>
    </main>
  );
}
