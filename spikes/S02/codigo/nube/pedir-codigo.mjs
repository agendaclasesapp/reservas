// Spike S02 en el proyecto real: pide el código para la casilla de prueba (signInWithOtp, cliente PKCE con
// la clave publicable) y muestra el estado en la base: usuario sin confirmar y trigger sin vincular (H-003).
// Uso (desde spikes/S02/codigo, con SUPABASE_DB_PASSWORD en el entorno): node nube/pedir-codigo.mjs
import { createClient } from '@supabase/supabase-js';
import { CASILLA, conectar, envNube, estadoCasilla } from './comun.mjs';

const { url, clave } = envNube();
const supabase = createClient(url, clave, { auth: { flowType: 'pkce', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const pedido = new Date();
const { data, error } = await supabase.auth.signInWithOtp({ email: CASILLA });
console.log(error ? `ERROR ${error.status ?? ''} ${error.code ?? ''} ${error.message}` : 'OK pedido', '·', pedido.toISOString());
console.log('respuesta:', JSON.stringify({ user: data?.user ?? null, session: data?.session ? '(sesión)' : null }));
const db = await conectar();
try {
  console.log(JSON.stringify(await estadoCasilla(db), null, 2));
} finally {
  await db.end();
}
