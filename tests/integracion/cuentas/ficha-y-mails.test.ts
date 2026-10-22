// B05 · T05.3 · Rama de ficha de CA-45 (motivo con HTML como dato, sin motivo, tras aprobar sin motivo, motivo demasiado largo
// → 422) y mails de cuenta nueva (AVI-02) y respondida (AVI-03) leídos en Mailpit (T-SOL-11), contra la API local con la
// Edge Function real. El «visto como texto» de la vista lo cubre el E2E (SEC-16): aquí se prueba que el dato llega intacto
// a la ficha (`sesion_actual`) y al mail. Datos sintéticos (@example.test, prefijo `T05 `).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { ingresarPorCodigo, rpc, sesionDe } from '../../soporte/usuarios';
import { esperarMailConAsunto, limpiarT05, mailsPorAsunto, mailT05, registrar, restaurarRechazado, rpcCon } from './ayuda';

const HTML = '<img src=x onerror=alert(1)> falta de cupo';
let rechazadoId: string;

beforeAll(async () => {
  await sesionDe('profesor');
  rechazadoId = (await sesionDe('rechazado')).alumnoId!;
  await limpiarT05();
}, 300_000);
afterEach(async () => {
  await restaurarRechazado(rechazadoId);
  await limpiarT05();
});
afterAll(cerrar);

/** Cuenta nueva con sesión real y la ficha completa por la API: queda pendiente y avisa al profesor (AVI-02). */
async function cuentaPendiente(etiqueta: string) {
  const mail = mailT05(etiqueta);
  const s = await ingresarPorCodigo(mail);
  const nombre = `T05 ${etiqueta} ${Date.now() % 100000}`;
  const r = await rpcCon(s.accessToken, 'completar_ficha', { p_nombre: nombre, p_telefono: '+598 99 555 666', p_fecha_nacimiento: '2000-01-01', p_como_llego: 'Amigos' });
  expect(r.status).toBe(200);
  const [a] = await sql<{ id: string }>('select id from public.alumno where user_id = $1', [s.userId]);
  return { mail, token: s.accessToken, nombre, id: a.id };
}

describe('AVI-02 mail de cuenta nueva al profesor', () => {
  it('AVI-02_CA-30_completar_la_ficha_manda_al_profesor_un_mail_que_nombra_la_cuenta_sin_fecha_de_nacimiento', async () => {
    const c = await cuentaPendiente('nueva');
    const mail = await esperarMailConAsunto((await sesionDe('profesor')).mail!, `Cuenta nueva pendiente de aprobación: ${c.nombre}`);
    registrar('AVI-02', { p_nombre: c.nombre }, { asunto: mail.Subject, para: mail.To.map((t) => t.Address), texto: mail.Text });
    expect(mail.Text).toContain(c.nombre);
    expect(mail.Text).not.toContain('2000-01-01');
    expect(mail.Text).not.toContain('+598 99 555 666');
    const [fila] = await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'cuenta_nueva' and alumno_id = $1`, [c.id]);
    expect(fila.n).toBe(1);
  }, 120_000);

  it('AVI-02_una_ficha_que_no_se_completa_no_encola_cuenta_nueva', async () => {
    // Sin cambio de ficha_incompleta a pendiente el trigger no corre; el caso del 429 está en supabase/tests/04_ingreso (H-200).
    const antes = (await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'cuenta_nueva'`))[0].n;
    const r = await rpc('profesor', 'completar_ficha', { p_nombre: 'X', p_telefono: '+598 99123456', p_fecha_nacimiento: '2000-01-01', p_como_llego: 'Y' });
    expect(r.status).toBe(403); // el profesor no completa fichas: tampoco encola nada
    const despues = (await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'cuenta_nueva'`))[0].n;
    expect(despues).toBe(antes);
  });
});

describe('CA-45 rama de ficha y AVI-03 (T-SOL-11)', () => {
  it('CA-45_rechazo_con_motivo_con_HTML_llega_a_la_ficha_como_dato_y_al_mail_con_Motivo', async () => {
    const c = await cuentaPendiente('rechazo');
    const r = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: c.id, p_motivo: HTML });
    registrar('CA-45_rechazo_con_motivo', { p_motivo: HTML }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(200);
    expect(r.cuerpo).toMatchObject({ estado: 'rechazado' });
    const ses = await rpcCon(c.token, 'sesion_actual', {});
    expect(ses.cuerpo).toMatchObject({ estado: 'rechazado', motivo_rechazo: HTML });
    const mail = await esperarMailConAsunto(c.mail, 'Tu cuenta fue rechazada');
    registrar('AVI-03_rechazo', { destinatario: c.mail }, { asunto: mail.Subject, texto: mail.Text });
    expect(mail.Text).toContain('Motivo:');
    expect(mail.Text).toContain('falta de cupo');
    expect(await mailsPorAsunto(c.mail, 'Tu cuenta fue rechazada')).toBe(1);
  }, 120_000);

  it('CA-45_sin_motivo_solo_el_estado_y_el_mail_no_trae_Motivo', async () => {
    const c = await cuentaPendiente('sinmotivo');
    const r = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: c.id, p_motivo: '   ' });
    expect(r.status).toBe(200);
    const ses = await rpcCon(c.token, 'sesion_actual', {});
    expect(ses.cuerpo).toMatchObject({ estado: 'rechazado', motivo_rechazo: null });
    const mail = await esperarMailConAsunto(c.mail, 'Tu cuenta fue rechazada');
    expect(mail.Text).not.toContain('Motivo:');
  }, 120_000);

  it('CA-45_H-037_tras_aprobar_sin_motivo_la_ficha_ya_no_recibe_el_motivo_del_rechazo_y_el_mail_de_aprobacion_llega', async () => {
    const c = await cuentaPendiente('aprueba');
    await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: c.id, p_motivo: HTML });
    expect((await rpcCon(c.token, 'sesion_actual', {})).cuerpo).toMatchObject({ motivo_rechazo: HTML });
    const r = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: c.id });
    registrar('CA-45_H-037_aprobar', { p_motivo: null }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(200);
    expect((await rpcCon(c.token, 'sesion_actual', {})).cuerpo).toMatchObject({ estado: 'aprobado', motivo_rechazo: null });
    const [f] = await sql<{ motivo_estado: string | null }>('select motivo_estado from public.alumno where id = $1', [c.id]);
    expect(f.motivo_estado).toBeNull();
    const mail = await esperarMailConAsunto(c.mail, 'Tu cuenta fue aprobada');
    expect(mail.Text).not.toContain('Mensaje del profesor');
    expect(mail.Text).not.toContain('onerror');
  }, 120_000);

  it('SEC-09_motivo_de_501_caracteres_da_422_y_el_de_500_pasa', async () => {
    const s = await sesionDe('rechazado');
    await sql(`update public.alumno set estado = 'pendiente', motivo_estado = null where id = $1`, [s.alumnoId]);
    const largo = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: s.alumnoId, p_motivo: 'x'.repeat(501) });
    registrar('SEC-09_motivo_501', { largo: 501 }, { status: largo.status, cuerpo: largo.cuerpo });
    expect(largo.status).toBe(422);
    expect(JSON.stringify(largo.cuerpo)).toContain('motivo');
    expect((await sql<{ estado: string }>('select estado from public.alumno where id = $1', [s.alumnoId]))[0].estado).toBe('pendiente');
    const ap = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: s.alumnoId, p_motivo: 'x'.repeat(501) });
    expect(ap.status).toBe(422);
    const justo = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: s.alumnoId, p_motivo: 'x'.repeat(500) });
    expect(justo.status).toBe(200);
    expect((await rpc('rechazado', 'sesion_actual')).cuerpo).toMatchObject({ motivo_rechazo: 'x'.repeat(500) });
  });

  it('ALU-03_rechazar_una_cuenta_que_no_esta_pendiente_da_409_CUENTA_NO_PENDIENTE_y_aprobar_una_rechazada_se_puede', async () => {
    const s = await sesionDe('rechazado');
    const r = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: s.alumnoId });
    expect(r.status).toBe(409);
    expect((r.cuerpo as { message: string }).message).toBe('CUENTA_NO_PENDIENTE');
    const a = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: s.alumnoId });
    expect(a.status).toBe(200);
    const [f] = await sql<{ estado: string; motivo_estado: string | null }>('select estado, motivo_estado from public.alumno where id = $1', [s.alumnoId]);
    expect(f).toEqual({ estado: 'aprobado', motivo_estado: null });
    const r404 = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: '00000000-0000-0000-0000-00000000dead' });
    expect(r404.status).toBe(404);
  });

  it('SEC-06_un_alumno_no_rechaza_y_el_estado_no_cambia', async () => {
    const r = await rpc('alumno', 'rechazar_cuenta', { p_alumno_id: rechazadoId });
    expect(r.status).toBe(403);
  });
});
