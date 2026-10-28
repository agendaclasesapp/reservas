// B04 · T04.4 · ingreso por código contra Auth local y Mailpit con la lógica real de src/modulos/ingreso/logica
// (CA-01, CA-44, ALU-01, SEC-12, SEC-13, H-021; casos T-ALU-01, T-ALU-03, T-ALU-16 rama de CAPTCHA).
// - CA-44: sin token de CAPTCHA `signInWithOtp` falla, Mailpit no recibe nada y no nace usuario; con el token de prueba
//   el código llega. Requiere el stack iniciado con `[auth.captcha]` (supabase/config.toml).
// - H-021: 403 otp_expired se clasifica como incorrecto o vencido por la hora del pedido; el 429 del reenvío pide esperar.
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { TOKEN_CAPTCHA } from '../../soporte/captcha';
import { esperarMail, mailUnico } from '../../soporte/correo';
import { entorno } from '../../soporte/entorno';
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

function deps(ahora: () => number = Date.now) {
  const c = clienteAnon();
  const d: DependenciasCodigo = {
    obtenerAuth: async () => c.auth as unknown as AuthCodigo,
    storage: almacenamientoEnMemoria(),
    ahora,
    alIngresar: async () => undefined,
  };
  return { c, d };
}

async function mailsA(m: string): Promise<number> {
  const r = await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${m}"`)}`);
  return ((await r.json()) as { messages: unknown[] }).messages.length;
}

describe('CA-44 CAPTCHA en el pedido del código', () => {
  it('CA-44_sin_token_signInWithOtp_falla_no_llega_mail_y_no_nace_usuario', async () => {
    const m = mail('sincaptcha');
    const r = await clienteAnon().auth.signInWithOtp({ email: m, options: { shouldCreateUser: true } });
    expect(r.error, 'Auth debe rechazar el pedido sin token (¿stack con [auth.captcha]?)').not.toBeNull();
    expect(r.error?.code).toBe('captcha_failed');
    await new Promise((res) => setTimeout(res, 1500));
    expect(await mailsA(m)).toBe(0);
    expect(await sql('select 1 from auth.users where email = $1', [m])).toEqual([]);
  });

  it('CA-44_con_el_token_de_prueba_el_codigo_llega', async () => {
    const m = mail('concaptcha');
    const r = await clienteAnon().auth.signInWithOtp({ email: m, options: { shouldCreateUser: true, captchaToken: TOKEN_CAPTCHA } });
    expect(r.error).toBeNull();
    expect((await esperarMail(m)).codigo).toMatch(/^\d{6}$/);
  });

  it('CA-44_pedirCodigo_sin_token_ni_llama_a_Auth_y_con_token_vacio_tampoco', async () => {
    const m = mail('pendiente');
    const { d } = deps();
    expect(await pedirCodigo({ mail: m, captchaToken: null }, d)).toMatchObject({ ok: false, error: 'captcha_pendiente' });
    expect(await pedirCodigo({ mail: m, captchaToken: '  ' }, d)).toMatchObject({ ok: false, error: 'captcha_pendiente' });
    expect(await mailsA(m)).toBe(0);
  });

  it('CA-44_el_rechazo_del_captcha_de_GoTrue_se_clasifica_como_captcha_y_no_como_H-021', async () => {
    const m = mail('rechazo');
    const { c, d } = deps();
    // Un cliente que "olvida" el token: llega a Auth sin captcha_token y GoTrue responde captcha_failed.
    const auth: AuthCodigo = {
      signInWithOtp: (cred) => c.auth.signInWithOtp({ email: cred.email, options: { shouldCreateUser: true } }) as never,
      verifyOtp: (cred) => c.auth.verifyOtp(cred) as never,
    };
    const r = await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, { ...d, obtenerAuth: async () => auth });
    expect(r).toMatchObject({ ok: false, error: 'captcha' });
  });
});

describe('CA-01 rama código y SEC-13', () => {
  it('CA-01_pedir_y_verificar_el_codigo_de_6_digitos_inicia_sesion_y_deja_la_cuenta_en_ficha_incompleta', async () => {
    const m = mail('ingreso');
    const { c, d } = deps();
    expect(await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, d)).toEqual({ ok: true });
    const mensaje = await esperarMail(m);
    expect(mensaje.codigo).toMatch(/^\d{6}$/);
    expect(mensaje.HTML + mensaje.Text).not.toMatch(/password|contraseña/i);
    expect(await verificarCodigo({ mail: m, codigo: mensaje.codigo! }, d)).toEqual({ ok: true });
    const { data } = await c.auth.getSession();
    expect(data.session?.user.email).toBe(m);
    expect(await alumnoDe(data.session!.user.id)).toMatchObject({ estado: 'ficha_incompleta', mail: m });
    const r = await c.rpc('sesion_actual');
    expect(r.data).toMatchObject({ rol: 'alumno', es_administrador: false, profesor: null, estado: 'ficha_incompleta', inscripciones: [] });
  });

  it('SEC-13_misma_respuesta_para_un_mail_con_usuario_de_Auth_y_uno_desconocido', async () => {
    const conocido = mail('conocido');
    const desconocido = mail('desconocido');
    const a = deps();
    expect(await pedirCodigo({ mail: conocido, captchaToken: TOKEN_CAPTCHA }, a.d)).toEqual({ ok: true });
    await a.c.auth.verifyOtp({ email: conocido, token: (await esperarMail(conocido)).codigo!, type: 'email' });
    // Corre hacia atrás el último envío para que el límite de 60 s no distinga a uno del otro.
    await sql(
      `update auth.users set confirmation_sent_at = case when confirmation_sent_at is null then null else now() - interval '5 minutes' end,
                             recovery_sent_at = case when recovery_sent_at is null then null else now() - interval '5 minutes' end
        where email = $1`,
      [conocido],
    );
    const rConocido = await pedirCodigo({ mail: conocido, captchaToken: TOKEN_CAPTCHA }, deps().d);
    const rDesconocido = await pedirCodigo({ mail: desconocido, captchaToken: TOKEN_CAPTCHA }, deps().d);
    expect(rConocido).toEqual({ ok: true });
    expect(rDesconocido).toEqual(rConocido);
  });

  it('SEC-13_un_mail_ya_registrado_y_otro_nuevo_reciben_la_misma_forma_de_respuesta_cruda', async () => {
    const conocido = mail('crudo1');
    const nuevo = mail('crudo2');
    await personaCargada({ mail: conocido, nombre: 'Conocido' });
    const a = await clienteAnon().auth.signInWithOtp({ email: conocido, options: { shouldCreateUser: true, captchaToken: TOKEN_CAPTCHA } });
    const b = await clienteAnon().auth.signInWithOtp({ email: nuevo, options: { shouldCreateUser: true, captchaToken: TOKEN_CAPTCHA } });
    expect({ error: a.error?.message ?? null, claves: Object.keys(a.data).sort() }).toEqual({ error: b.error?.message ?? null, claves: Object.keys(b.data).sort() });
    expect(a.error).toBeNull();
  });
});

describe('H-021 códigos incorrecto, vencido y reenvío', () => {
  it('H-021_un_codigo_incorrecto_da_403_otp_expired_y_se_muestra_como_incorrecto', async () => {
    const m = mail('incorrecto');
    const { c, d } = deps();
    expect((await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, d)).ok).toBe(true);
    const real = (await esperarMail(m)).codigo!;
    const otro = String((Number(real) + 1) % 1_000_000).padStart(6, '0');
    const crudo = await clienteAnon().auth.verifyOtp({ email: m, token: otro, type: 'email' });
    expect(crudo.error?.status).toBe(403);
    expect(crudo.error?.code).toBe('otp_expired');
    const r = await verificarCodigo({ mail: m, codigo: otro }, d);
    expect(r).toMatchObject({ ok: false, error: 'incorrecto', mensaje: 'El código no es correcto. Revisalo y probá de nuevo.' });
    expect((await c.auth.getSession()).data.session).toBeNull();
  });

  it('H-021_pasados_600_s_del_pedido_el_mismo_error_se_muestra_como_vencido', async () => {
    const m = mail('vencido');
    const t0 = Date.now();
    let ahora = t0;
    const { c, d } = deps(() => ahora);
    expect((await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, d)).ok).toBe(true);
    const real = (await esperarMail(m)).codigo!;
    const otro = String((Number(real) + 1) % 1_000_000).padStart(6, '0');
    ahora = t0 + 601_000;
    const r = await verificarCodigo({ mail: m, codigo: otro }, d);
    expect(r).toMatchObject({ ok: false, error: 'vencido', mensaje: 'El código venció. Pedí uno nuevo.' });
    expect((await c.auth.getSession()).data.session).toBeNull();
  });

  it('H-021_el_reenvio_antes_de_60_s_da_429_y_se_muestra_esperar_un_minuto', async () => {
    const m = mail('reenvio');
    const { d } = deps();
    expect(await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, d)).toEqual({ ok: true });
    const crudo = await clienteAnon().auth.signInWithOtp({ email: m, options: { captchaToken: TOKEN_CAPTCHA } });
    expect(crudo.error?.status).toBe(429);
    const r = await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, d);
    expect(r).toMatchObject({ ok: false, error: 'esperar_reenvio', mensaje: 'Esperá un minuto para pedir otro código.' });
  });

  it('SEC-12_el_mail_trae_solo_el_codigo_sin_enlaces', async () => {
    const m = mail('sec12');
    expect((await pedirCodigo({ mail: m, captchaToken: TOKEN_CAPTCHA }, deps().d)).ok).toBe(true);
    const mensaje = await esperarMail(m);
    expect(mensaje.codigo).toMatch(/^\d{6}$/);
    expect(mensaje.HTML).not.toMatch(/href|:\/\//i);
    expect(mensaje.Text).not.toContain('://');
  });
});
