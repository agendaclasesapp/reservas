// B04 · H-180 · toma de cuenta por preregistro con contraseña, contra Auth local y Mailpit (SEC-14, ALU-01, ALU-02,
// ADR-007, ADR-015). El atacante hace signUp con el mail M y su contraseña (queda sin confirmar); la víctima pide y
// verifica el código de M (o entra con Google) y el trigger vincula la cuenta; la contraseña del atacante no debe
// servir después. La migración 202611000403_sin_contrasena deja `encrypted_password` siempre en ''.
// Requiere el stack con `[auth.captcha]`: todo pedido a Auth lleva el token de prueba (CA-44).
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { TOKEN_CAPTCHA } from '../../soporte/captcha';
import { esperarMail, mailUnico } from '../../soporte/correo';
import { clienteAnon } from '../../soporte/usuarios';
import { pedirCodigo, verificarCodigo, type AuthCodigo, type DependenciasCodigo } from '../../../src/modulos/ingreso/logica/codigo';
import { alumnoDe, almacenamientoEnMemoria, borrarPorMail, personaCargada } from './ayuda';

const creados: string[] = [];
const mail = (p: string) => {
  const m = mailUnico(`b04.${p}`);
  creados.push(m);
  return m;
};

afterEach(async () => {
  await borrarPorMail(creados.splice(0));
});
afterAll(cerrar);

function deps() {
  const c = clienteAnon();
  const d: DependenciasCodigo = {
    obtenerAuth: async () => c.auth as unknown as AuthCodigo,
    storage: almacenamientoEnMemoria(),
    ahora: Date.now,
    alIngresar: async () => undefined,
  };
  return { c, d };
}

/** El atacante preregistra M con contraseña por la API pública (anon key + CAPTCHA de prueba). */
async function preregistrar(m: string, clave: string): Promise<string> {
  const alta = await clienteAnon().auth.signUp({ email: m, password: clave, options: { captchaToken: TOKEN_CAPTCHA } });
  expect(alta.error).toBeNull();
  expect(alta.data.session, 'con enable_confirmations el signUp no da sesión').toBeNull();
  await esperarMail(m); // el mail de confirmación del signUp llega al buzón de la víctima
  return alta.data.user!.id;
}

async function contrasenaGuardada(m: string): Promise<string | null> {
  const f = await sql<{ encrypted_password: string | null }>('select encrypted_password from auth.users where email = $1', [m]);
  return f[0]?.encrypted_password ?? null;
}

async function entrarConContrasena(m: string, clave: string) {
  const r = await clienteAnon().auth.signInWithPassword({ email: m, password: clave, options: { captchaToken: TOKEN_CAPTCHA } });
  return { error: r.error, sesion: r.data.session };
}

describe('H-180 preregistro con contraseña', () => {
  it('H-180_signUp_con_contrasena_codigo_verificado_por_la_victima_y_signInWithPassword_del_atacante_falla', async () => {
    const m = mail('h180codigo');
    const clave = `Atacante-${randomUUID()}`;
    // ALU-07: el profesor ya dio de alta al alumno con ese mail (el caso de más valor para el atacante).
    const alumnoId = await personaCargada({ mail: m, nombre: 'Víctima' });
    const userId = await preregistrar(m, clave);
    expect(await contrasenaGuardada(m), 'H-180: la contraseña del signUp no se guarda').toBe('');
    expect(await alumnoDe(userId), 'SEC-14: sin confirmar no se vincula').toBeNull();

    // La víctima pide su código (se corre el último envío para no chocar con el límite de 60 s) y lo verifica.
    await sql("update auth.users set confirmation_sent_at = now() - interval '5 minutes' where email = $1", [m]);
    const { c, d } = deps();
    expect(await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, d)).toEqual({ ok: true });
    const codigo = (await esperarMail(m, 2)).codigo!;
    expect(await verificarCodigo({ mail: m, codigo }, d)).toEqual({ ok: true });
    const { data } = await c.auth.getSession();
    expect(data.session?.user.id).toBe(userId);
    expect(await alumnoDe(userId), 'ALU-01: se vincula conservando id y estado').toMatchObject({ id: alumnoId, estado: 'completa' });
    expect((await c.rpc('sesion_actual')).data).toMatchObject({ rol: 'alumno', estado: 'completa', inscripciones: [{ slug: 'profesor-prueba', estado: 'aprobado' }] });

    // El atacante intenta entrar con su contraseña sobre la cuenta ya confirmada.
    const intento = await entrarConContrasena(m, clave);
    expect(intento.sesion).toBeNull();
    expect(intento.error?.status).toBe(400);
    expect(intento.error?.code).toBe('invalid_credentials');
    expect(await contrasenaGuardada(m)).toBe('');

    // Tampoco se puede fijar una contraseña después (updateUser con la sesión de la víctima).
    const nueva = `Nueva-${randomUUID()}`;
    await c.auth.updateUser({ password: nueva });
    expect(await contrasenaGuardada(m)).toBe('');
    expect((await entrarConContrasena(m, nueva)).sesion).toBeNull();
  });

  it('H-180_rama_Google_simulada_tras_un_preregistro_con_contrasena_la_contrasena_no_sirve', async () => {
    const m = mail('h180google');
    const clave = `Atacante-${randomUUID()}`;
    const userId = await preregistrar(m, clave);
    // Google confirma el mail del usuario existente con el nombre del perfil, como lo deja GoTrue (CA-02).
    await sql(
      `update auth.users set email_confirmed_at = now(),
              raw_user_meta_data = raw_user_meta_data || '{"full_name":"Ana Google"}'::jsonb
        where id = $1`,
      [userId],
    );
    expect(await alumnoDe(userId)).toMatchObject({ estado: 'ficha_incompleta', nombre: 'Ana Google', mail: m });
    const intento = await entrarConContrasena(m, clave);
    expect(intento.sesion).toBeNull();
    expect(intento.error?.code).toBe('invalid_credentials');
    expect(await contrasenaGuardada(m)).toBe('');
  });
});
