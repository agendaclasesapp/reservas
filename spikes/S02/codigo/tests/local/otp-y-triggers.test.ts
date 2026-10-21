// Spike S02 contra el stack local: código de 6 dígitos (ALU-01, WEB-02) y triggers sobre auth.users
// (H-003, SEC-14, ALU-02, ALU-07, ALU-11). El vencimiento de 600 s se prueba corriendo hacia atrás
// confirmation_sent_at / recovery_sent_at en la base (el reloj de GoTrue lee esas columnas).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { alumnoDe, cliente, db, envejecerEnvio, esperarMail, mailUnico, sql, traza, usuario } from './soporte';

const registro: Record<string, unknown> = {};
function anotar(clave: string, valor: unknown) {
  registro[clave] = valor;
}

beforeAll(async () => {
  await db.connect();
});
afterAll(async () => {
  // Evidencia para resultado.md: errores literales de GoTrue.
  process.stdout.write(`RESULTADO ${JSON.stringify(registro)}\n`);
  await db.end();
});

// GoTrue lee estas columnas como texto no nulo: un insert directo debe dejarlas en ''.
const TOKENS = 'confirmation_token, recovery_token, email_change_token_new, email_change';
const VACIOS = "'', '', '', ''";

function otroCodigo(c: string) {
  return String((Number(c) + 1) % 1_000_000).padStart(6, '0');
}

describe('S02 código por mail y triggers en local', () => {
  const a = { email: mailUnico('alumna'), codigo: '' };

  it('S02_ALU_01_llega_codigo_de_6_digitos_sin_enlaces_y_el_usuario_nace_sin_confirmar', async () => {
    const r = await cliente().auth.signInWithOtp({ email: a.email, options: { shouldCreateUser: true } });
    expect(r.error).toBeNull();
    const mail = await esperarMail(a.email);
    expect(mail.Subject).toBe('Tu código de ingreso');
    expect(mail.codigo).toMatch(/^\d{6}$/);
    expect(mail.HTML).not.toMatch(/href|http/i);
    expect(mail.Text).not.toMatch(/http/i);
    a.codigo = mail.codigo!;
    const u = await usuario(a.email);
    expect(u.email_confirmed_at).toBeNull();
    // H-003 / SEC-14: el trigger corrió en el insert pero no creó ni vinculó nada.
    expect(await alumnoDe(u.id)).toEqual([]);
    expect(await traza(u.id)).toEqual([
      { disparador: 'al_confirmar_usuario', operacion: 'INSERT', confirmado: false, accion: 'nada: sin confirmar' },
    ]);
  });

  it('S02_WEB_02_reenvio_antes_de_60s_se_rechaza', async () => {
    const r = await cliente().auth.signInWithOtp({ email: a.email });
    anotar('reenvio_antes_60s', { status: r.error?.status, code: r.error?.code, message: r.error?.message });
    expect(r.error?.status).toBe(429);
  });

  it('S02_WEB_02_codigo_erroneo_da_error_y_no_crea_nada', async () => {
    const r = await cliente().auth.verifyOtp({ email: a.email, token: otroCodigo(a.codigo), type: 'email' });
    anotar('codigo_erroneo', { status: r.error?.status, code: r.error?.code, message: r.error?.message });
    expect(r.error).not.toBeNull();
    expect(r.data.session).toBeNull();
    const u = await usuario(a.email);
    expect(u.email_confirmed_at).toBeNull();
    expect(await alumnoDe(u.id)).toEqual([]);
  });

  it('S02_WEB_02_codigo_vencido_a_los_600s_da_error', async () => {
    const b = mailUnico('vencida');
    await cliente().auth.signInWithOtp({ email: b });
    const { codigo } = await esperarMail(b);
    await envejecerEnvio(b, 610);
    const r = await cliente().auth.verifyOtp({ email: b, token: codigo!, type: 'email' });
    anotar('codigo_vencido', { status: r.error?.status, code: r.error?.code, message: r.error?.message });
    expect(r.error).not.toBeNull();
    expect(r.data.session).toBeNull();
    expect((await usuario(b)).email_confirmed_at).toBeNull();
  });

  it('S02_ALU_02_codigo_correcto_a_los_590s_crea_sesion_y_el_trigger_crea_la_ficha', async () => {
    await envejecerEnvio(a.email, 590);
    const c = cliente();
    const r = await c.auth.verifyOtp({ email: a.email, token: a.codigo, type: 'email' });
    expect(r.error).toBeNull();
    expect(r.data.session?.access_token).toBeTruthy();
    expect((await c.auth.getSession()).data.session?.user.email).toBe(a.email);
    const u = await usuario(a.email);
    expect(u.email_confirmed_at).not.toBeNull();
    const al = await alumnoDe(u.id);
    expect(al).toHaveLength(1);
    expect(al[0].estado).toBe('ficha_incompleta');
    const t = await traza(u.id);
    anotar('traza_primer_ingreso', t);
    anotar('ultimo_ingreso_primer_ingreso', { ultimo_ingreso: al[0].ultimo_ingreso, last_sign_in_at: u.last_sign_in_at });
    expect(t.filter((x) => x.accion === 'crea alumno ficha_incompleta')).toHaveLength(1);
  });

  it('S02_codigo_ya_usado_da_error', async () => {
    const r = await cliente().auth.verifyOtp({ email: a.email, token: a.codigo, type: 'email' });
    anotar('codigo_ya_usado', { status: r.error?.status, code: r.error?.code, message: r.error?.message });
    expect(r.error).not.toBeNull();
  });

  it('S02_ALU_11_segundo_ingreso_por_codigo_actualiza_ultimo_ingreso_sin_duplicar_alumno', async () => {
    await envejecerEnvio(a.email, 61);
    const u0 = await usuario(a.email);
    const r = await cliente().auth.signInWithOtp({ email: a.email });
    expect(r.error).toBeNull();
    const mail = await esperarMail(a.email, 2);
    expect(mail.codigo).toMatch(/^\d{6}$/);
    expect(mail.HTML).not.toMatch(/href|http/i);
    const v = await cliente().auth.verifyOtp({ email: a.email, token: mail.codigo!, type: 'email' });
    expect(v.error).toBeNull();
    const u1 = await usuario(a.email);
    expect(u1.last_sign_in_at!.getTime()).toBeGreaterThan(u0.last_sign_in_at!.getTime());
    const al = await alumnoDe(u1.id);
    expect(al).toHaveLength(1);
    expect(al[0].ultimo_ingreso?.getTime()).toBe(u1.last_sign_in_at!.getTime());
    anotar('traza_segundo_ingreso', await traza(u1.id));
  });

  it('S02_ALU_07_alta_del_profesor_se_vincula_solo_al_verificar', async () => {
    const email = mailUnico('alta');
    const [fila] = await sql<{ id: string }>(
      `insert into public.alumno (email, nombre, estado) values ($1, 'Alta Por Profesor', 'aprobado') returning id`,
      [email],
    );
    await cliente().auth.signInWithOtp({ email });
    const { codigo } = await esperarMail(email);
    const u = await usuario(email);
    expect(await sql('select user_id from public.alumno where id = $1', [fila.id])).toEqual([{ user_id: null }]);
    expect((await cliente().auth.verifyOtp({ email, token: codigo!, type: 'email' })).error).toBeNull();
    const al = await alumnoDe(u.id);
    expect(al).toHaveLength(1);
    expect(al[0]).toMatchObject({ id: fila.id, estado: 'aprobado' });
  });

  it('S02_profesor_se_vincula_solo_al_verificar', async () => {
    const email = mailUnico('profe');
    await sql('update public.profesor set email = $1, user_id = null', [email]);
    await cliente().auth.signInWithOtp({ email });
    const { codigo } = await esperarMail(email);
    expect(await sql('select user_id from public.profesor')).toEqual([{ user_id: null }]);
    expect((await cliente().auth.verifyOtp({ email, token: codigo!, type: 'email' })).error).toBeNull();
    const u = await usuario(email);
    expect(await sql('select user_id from public.profesor')).toEqual([{ user_id: u.id }]);
    expect(await alumnoDe(u.id)).toEqual([]);
  });

  it('S02_SEC_14_google_simulado_llega_confirmado_en_el_insert_y_crea_ficha_con_nombre', async () => {
    // Simulación: así inserta GoTrue un usuario de Google (email_confirmed_at ya puesto en el INSERT).
    const email = mailUnico('google');
    const [u] = await sql<{ id: string }>(
      `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, ${TOKENS})
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, now(),
               '{"provider":"google","providers":["google"]}', '{"full_name":"Ana Google"}', now(), now(), ${VACIOS})
       returning id`,
      [email],
    );
    expect(await alumnoDe(u.id)).toMatchObject([{ nombre: 'Ana Google', estado: 'ficha_incompleta', ultimo_ingreso: null }]);
    await sql('update auth.users set last_sign_in_at = now() where id = $1', [u.id]);
    expect((await alumnoDe(u.id))[0].ultimo_ingreso).not.toBeNull();
    // Idempotente: otra actualización de email_confirmed_at no duplica.
    await sql('update auth.users set email_confirmed_at = now() where id = $1', [u.id]);
    expect(await alumnoDe(u.id)).toHaveLength(1);
    expect((await traza(u.id)).map((x) => x.accion)).toEqual([
      'crea alumno ficha_incompleta',
      'actualiza ultimo_ingreso',
      'nada: ya vinculado',
    ]);
  });

  it('S02_WEB_02_GoTrue_no_distingue_codigo_erroneo_vencido_ni_usado', () => {
    // Hallazgo del spike: las tres respuestas son idénticas; la distinción la hace la SPA (src/codigo.ts).
    expect(registro.codigo_erroneo).toEqual({ status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' });
    expect(registro.codigo_vencido).toEqual(registro.codigo_erroneo);
    expect(registro.codigo_ya_usado).toEqual(registro.codigo_erroneo);
  });

  it('S02_signInWithOtp_responde_igual_para_mail_conocido_y_desconocido', async () => {
    const conocido = mailUnico('conocido');
    await sql(
      `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, created_at, updated_at, ${TOKENS})
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, now(),
               '{"provider":"email","providers":["email"]}', now(), now(), ${VACIOS})`,
      [conocido],
    );
    const r1 = await cliente().auth.signInWithOtp({ email: conocido });
    const r2 = await cliente().auth.signInWithOtp({ email: mailUnico('desconocido') });
    anotar('respuesta_conocido_vs_desconocido', { conocido: r1, desconocido: r2 });
    expect(r1).toEqual(r2);
  });
});
