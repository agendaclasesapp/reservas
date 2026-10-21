import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Link, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router';
import { supabase } from './supabase';
import { guardarRuta, procesarRetorno, type Retorno } from './retorno';
import { clasificarErrorCodigo } from './codigo';

function Marco({ retorno }: { retorno: Retorno }) {
  const [mail, setMail] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setMail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setMail(s?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <main>
      <nav>
        <Link to="/">Agenda</Link> · <Link to="/mis-clases">Mis clases</Link> · <Link to="/ingreso">Ingresar</Link>
      </nav>
      <p data-testid="sesion">{mail ?? 'sin sesión'}</p>
      {retorno.error !== null && (
        <p role="alert" data-testid="error-retorno">
          {retorno.error}
        </p>
      )}
      <Outlet />
    </main>
  );
}

function Pagina({ titulo }: { titulo: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <section>
      <h1>{titulo}</h1>
      <button type="button" onClick={() => navigate('/ingreso', { state: { desde: pathname } })}>
        Ingresar desde aquí
      </button>
    </section>
  );
}

function Ingreso() {
  const navigate = useNavigate();
  const location = useLocation();
  const desde = (location.state as { desde?: string } | null)?.desde ?? '/';
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [pedidoEn, setPedidoEn] = useState(0);

  async function conGoogle() {
    guardarRuta(window.sessionStorage, '#' + desde);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
    });
    if (error) setMensaje(error.message);
  }

  async function pedirCodigo(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (!error) setPedidoEn(Date.now());
    setMensaje(error ? error.message : 'Te enviamos un código de 6 dígitos.');
  }

  async function verificar(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' });
    const tipo = clasificarErrorCodigo(error, pedidoEn, Date.now());
    if (tipo !== null) setMensaje(`codigo-${tipo}`);
    else navigate(desde, { replace: true });
  }

  return (
    <section>
      <h1>Ingreso</h1>
      <button type="button" onClick={() => void conGoogle()}>
        Ingresar con Google
      </button>
      <form onSubmit={(e) => void pedirCodigo(e)}>
        <label>
          Mail <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit">Enviar código</button>
      </form>
      <form onSubmit={(e) => void verificar(e)}>
        <label>
          Código <input inputMode="numeric" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </label>
        <button type="submit">Verificar</button>
      </form>
      <p data-testid="mensaje">{mensaje}</p>
    </section>
  );
}

async function iniciar() {
  const retorno = await procesarRetorno({
    auth: supabase.auth,
    href: window.location.href,
    history: window.history,
    storage: window.sessionStorage,
  });
  const router = createHashRouter([
    {
      path: '/',
      element: <Marco retorno={retorno} />,
      children: [
        { index: true, element: <Pagina titulo="Agenda" /> },
        { path: 'mis-clases', element: <Pagina titulo="Mis clases" /> },
        { path: 'ingreso', element: <Ingreso /> },
      ],
    },
  ]);
  createRoot(document.getElementById('raiz')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

void iniciar();
