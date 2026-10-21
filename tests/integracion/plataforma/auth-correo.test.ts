// SEC-12 (mail con solo el código, sin enlaces) y SEC-13 (signInWithOtp no revela si el mail existe),
// contra Auth local y Mailpit. Casos: T-ALU-01, T-ALU-03 (ramas de B01: plantilla y límites de envío).
import { afterAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { esperarMail, mailUnico } from '../../soporte/correo';
import { clienteAnon, sesionDe } from '../../soporte/usuarios';

afterAll(cerrar);

describe('SEC-12 mail del código de ingreso', () => {
  it('SEC-12_el_mail_trae_un_codigo_de_6_digitos_sin_enlaces', async () => {
    const mail = mailUnico('sec12');
    const r = await clienteAnon().auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
    expect(r.error).toBeNull();
    const m = await esperarMail(mail);
    expect(m.Subject).toBe('Tu código de ingreso');
    expect(m.codigo).toMatch(/^\d{6}$/);
    expect(m.HTML).not.toMatch(/href|:\/\//i);
    expect(m.Text).not.toContain('://');
  });

  it('SEC-12_un_alta_nueva_no_crea_alumno_hasta_confirmar_el_mail', async () => {
    const mail = mailUnico('sinconfirmar');
    await clienteAnon().auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
    await esperarMail(mail);
    const [u] = await sql<{ id: string; email_confirmed_at: Date | null }>('select id, email_confirmed_at from auth.users where email = $1', [mail]);
    expect(u.email_confirmed_at).toBeNull();
    expect(await sql('select 1 from public.alumno where user_id = $1', [u.id])).toEqual([]);
  });
});

describe('SEC-13 Auth no revela si el mail existe ni deja reenviar antes de 60 s', () => {
  it('SEC-13_misma_respuesta_para_mail_conocido_y_desconocido', async () => {
    const conocido = (await sesionDe('alumno')).mail!;
    // Corre hacia atrás el último envío para que el límite de 60 s no distinga a uno del otro.
    await sql(
      `update auth.users set confirmation_sent_at = case when confirmation_sent_at is null then null else now() - interval '5 minutes' end,
                             recovery_sent_at = case when recovery_sent_at is null then null else now() - interval '5 minutes' end
        where email = $1`,
      [conocido],
    );
    const a = await clienteAnon().auth.signInWithOtp({ email: conocido, options: { shouldCreateUser: true } });
    const b = await clienteAnon().auth.signInWithOtp({ email: mailUnico('desconocido'), options: { shouldCreateUser: true } });
    expect({ error: a.error?.message ?? null, data: Object.keys(a.data).sort() }).toEqual({ error: b.error?.message ?? null, data: Object.keys(b.data).sort() });
    expect(a.error).toBeNull();
  });

  it('SEC-13_reenvio_antes_de_60s_se_rechaza_con_429', async () => {
    const mail = mailUnico('reenvio');
    const c = clienteAnon();
    expect((await c.auth.signInWithOtp({ email: mail })).error).toBeNull();
    const r2 = await c.auth.signInWithOtp({ email: mail });
    expect(r2.error?.status).toBe(429);
  });

  it('SEC-13_codigo_incorrecto_no_inicia_sesion', async () => {
    const mail = mailUnico('malcodigo');
    const c = clienteAnon();
    await c.auth.signInWithOtp({ email: mail });
    const m = await esperarMail(mail);
    const otro = String((Number(m.codigo) + 1) % 1_000_000).padStart(6, '0');
    const v = await c.auth.verifyOtp({ email: mail, token: otro, type: 'email' });
    expect(v.error).not.toBeNull();
    expect(v.data.session).toBeNull();
  });
});
