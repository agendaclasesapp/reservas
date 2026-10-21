// Spike S02 en el proyecto real: verifica el código de 6 dígitos que el humano leyó en el mail de
// agendaclasesapp+s02@gmail.com y muestra qué hicieron los triggers (H-003, SEC-14, ALU-11).
// Imprime solo OK/ERROR y el estado; nunca tokens. Uso: node verificar-codigo.mjs <codigo>
// Requiere SUPABASE_DB_PASSWORD en el entorno y .env.nube (URL y clave publicable).
import { createClient } from '@supabase/supabase-js';
import { CASILLA, conectar, envNube, estadoCasilla } from './nube/comun.mjs';

const codigo = (process.argv[2] ?? '').trim();
if (!/^\d{6}$/.test(codigo)) {
  console.log('ERROR uso: node verificar-codigo.mjs <codigo de 6 digitos>');
  process.exit(2);
}
const { url, clave } = envNube();
const supabase = createClient(url, clave, { auth: { flowType: 'pkce', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const { data, error } = await supabase.auth.verifyOtp({ email: CASILLA, token: codigo, type: 'email' });
if (error) console.log(`ERROR ${error.status ?? ''} ${error.code ?? ''} ${error.message}`);
else console.log(`OK sesión=${data.session ? 'sí' : 'no'} usuario_confirmado=${data.user?.email_confirmed_at ? 'sí' : 'no'}`);
const db = await conectar();
try {
  console.log(JSON.stringify(await estadoCasilla(db), null, 2));
} finally {
  await db.end();
}
process.exitCode = error ? 1 : 0;
