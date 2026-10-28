// B05 · T05.3 · Rama de ficha de CA-45 (motivo con HTML como dato, sin motivo, tras aprobar sin motivo, motivo demasiado largo
// → 422) y mails de cuenta nueva (AVI-02) y respondida (AVI-03) leídos en Mailpit (T-SOL-11), contra la API local con la
// Edge Function real. El «visto como texto» de la vista lo cubre el E2E (SEC-16): aquí se prueba que el dato llega intacto
// a la ficha (`sesion_actual`) y al mail. Datos sintéticos (@example.test, prefijo `T05 `).
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { ingresarPorCodigo, rpc, sesionDe, SLUG_A } from '../../soporte/usuarios';
import { esperarMailConAsunto, inscripcionDe, limpiarT05, mailsPorAsunto, mailT05, registrar, restaurarRechazado, rpcCon } from './ayuda';

const HTML = '<img src=x onerror=alert(1)> falta de cupo';
let rechazadoId: string;

beforeAll(async () => {
  await sesionDe('profesor');
  await sesionDe('profesorB');
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
  const r = await rpcCon(s.accessToken, 'completar_ficha', { p_nombre: nombre, p_telefono: '+598 99 555 666', p_fecha_nacimiento: '2000-01-01', p_slug: SLUG_A, p_como_llego: 'Amigos' });
  expect(r.status).toBe(200);
  const [a] = await sql<{ id: string }>('select id from public.alumno where user_id = $1', [s.userId]);
  return { mail, token: s.accessToken, nombre, id: a.id };
}

describe('AVI-02 mail de cuenta nueva al profesor', () => {
  it('AVI-02_CA-30_completar_la_ficha_manda_al_profesor_un_mail_que_nombra_la_cuenta_sin_fecha_de_nacimiento', async () => {
    const c = await cuentaPendiente('nueva');
    const mail = await esperarMailConAsunto((await sesionDe('profesor')).mail!, `Pedido de acceso pendiente de aprobación: ${c.nombre}`);
    registrar('AVI-02', { p_nombre: c.nombre }, { asunto: mail.Subject, para: mail.To.map((t) => t.Address), texto: mail.Text });
    // CA-55: el aviso llega solo al profesor del enlace; la profesora B no recibe nada.
    expect(await mailsPorAsunto((await sesionDe('profesorB')).mail!, `Pedido de acceso pendiente de aprobación: ${c.nombre}`)).toBe(0);
    expect(mail.Text).toContain(c.nombre);
    expect(mail.Text).not.toContain('2000-01-01');
    expect(mail.Text).not.toContain('+598 99 555 666');
    const [fila] = await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'cuenta_nueva' and alumno_id = $1`, [c.id]);
    expect(fila.n).toBe(1);
  }, 120_000);

  it('AVI-02_una_ficha_que_no_se_completa_no_encola_cuenta_nueva', async () => {
    // Sin cambio de ficha_incompleta a pendiente el trigger no corre; el caso del 429 está en supabase/tests/04_ingreso (H-200).
    const antes = (await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'cuenta_nueva'`))[0].n;
    const r = await rpc('profesor', 'completar_ficha', { p_nombre: 'X', p_telefono: '+598 99123456', p_fecha_nacimiento: '2000-01-01', p_slug: SLUG_A, p_como_llego: 'Y' });
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
    expect(ses.cuerpo).toMatchObject({ estado: 'completa', inscripciones: [{ slug: SLUG_A, estado: 'rechazado', motivo_rechazo: HTML }] });
    const mail = await esperarMailConAsunto(c.mail, 'Profesor de Prueba rechazó tu acceso');
    registrar('AVI-03_rechazo', { destinatario: c.mail }, { asunto: mail.Subject, texto: mail.Text });
    expect(mail.Text).toContain('Motivo:');
    expect(mail.Text).toContain('falta de cupo');
    expect(await mailsPorAsunto(c.mail, 'Profesor de Prueba rechazó tu acceso')).toBe(1);
  }, 120_000);

  it('CA-45_sin_motivo_solo_el_estado_y_el_mail_no_trae_Motivo', async () => {
    const c = await cuentaPendiente('sinmotivo');
    const r = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: c.id, p_motivo: '   ' });
    expect(r.status).toBe(200);
    const ses = await rpcCon(c.token, 'sesion_actual', {});
    expect(ses.cuerpo).toMatchObject({ inscripciones: [{ slug: SLUG_A, estado: 'rechazado', motivo_rechazo: null }] });
    const mail = await esperarMailConAsunto(c.mail, 'Profesor de Prueba rechazó tu acceso');
    expect(mail.Text).not.toContain('Motivo:');
  }, 120_000);

  it('CA-45_H-037_tras_aprobar_sin_motivo_la_ficha_ya_no_recibe_el_motivo_del_rechazo_y_el_mail_de_aprobacion_llega', async () => {
    const c = await cuentaPendiente('aprueba');
    await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: c.id, p_motivo: HTML });
    expect((await rpcCon(c.token, 'sesion_actual', {})).cuerpo).toMatchObject({ inscripciones: [{ motivo_rechazo: HTML }] });
    const r = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: c.id });
    registrar('CA-45_H-037_aprobar', { p_motivo: null }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(200);
    expect((await rpcCon(c.token, 'sesion_actual', {})).cuerpo).toMatchObject({ inscripciones: [{ slug: SLUG_A, estado: 'aprobado', motivo_rechazo: null }] });
    expect((await inscripcionDe(c.id))!.motivo_estado).toBeNull();
    const mail = await esperarMailConAsunto(c.mail, 'Profesor de Prueba aprobó tu acceso');
    expect(mail.Text).not.toContain('Mensaje:');
    expect(mail.Text).not.toContain('onerror');
  }, 120_000);

  it('SEC-09_motivo_de_501_caracteres_da_422_y_el_de_500_pasa', async () => {
    const s = await sesionDe('rechazado');
    await sql(`update public.inscripcion set estado = 'pendiente', motivo_estado = null where alumno_id = $1`, [s.alumnoId]);
    const largo = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: s.alumnoId, p_motivo: 'x'.repeat(501) });
    registrar('SEC-09_motivo_501', { largo: 501 }, { status: largo.status, cuerpo: largo.cuerpo });
    expect(largo.status).toBe(422);
    expect(JSON.stringify(largo.cuerpo)).toContain('motivo');
    expect((await inscripcionDe(s.alumnoId!))!.estado).toBe('pendiente');
    const ap = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: s.alumnoId, p_motivo: 'x'.repeat(501) });
    expect(ap.status).toBe(422);
    const justo = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: s.alumnoId, p_motivo: 'x'.repeat(500) });
    expect(justo.status).toBe(200);
    expect((await rpc('rechazado', 'sesion_actual')).cuerpo).toMatchObject({ inscripciones: [{ motivo_rechazo: 'x'.repeat(500) }] });
  });

  it('ALU-03_rechazar_una_cuenta_que_no_esta_pendiente_da_409_CUENTA_NO_PENDIENTE_y_aprobar_una_rechazada_se_puede', async () => {
    const s = await sesionDe('rechazado');
    const r = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: s.alumnoId });
    expect(r.status).toBe(409);
    expect((r.cuerpo as { message: string }).message).toBe('CUENTA_NO_PENDIENTE');
    const a = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: s.alumnoId });
    expect(a.status).toBe(200);
    const f = await inscripcionDe(s.alumnoId!);
    expect(f).toMatchObject({ estado: 'aprobado', motivo_estado: null });
    const r404 = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: '00000000-0000-0000-0000-00000000dead' });
    expect(r404.status).toBe(404);
  });

  it('SEC-06_un_alumno_no_rechaza_y_el_estado_no_cambia', async () => {
    const r = await rpc('alumno', 'rechazar_cuenta', { p_alumno_id: rechazadoId });
    expect(r.status).toBe(403);
    expect((await inscripcionDe(rechazadoId))!.estado).toBe('rechazado');
  });
});

describe('CA-51 / CA-52 / CA-55 cada profesor decide solo sobre quien le pidió acceso', () => {
  it('CA-52_SEC-06_la_profesora_B_no_aprueba_ni_rechaza_a_quien_pidio_acceso_a_A_y_recibe_el_404_de_un_id_inexistente', async () => {
    const c = await cuentaPendiente('ajena');
    const inexistente = '00000000-0000-0000-0000-00000000dead';
    for (const f of ['aprobar_cuenta', 'rechazar_cuenta'] as const) {
      const ajena = await rpc('profesorB', f, { p_alumno_id: c.id });
      const nada = await rpc('profesorB', f, { p_alumno_id: inexistente });
      registrar(`CA-52_${f}`, { p_alumno_id: c.id }, { ajena: [ajena.status, ajena.cuerpo], inexistente: [nada.status, nada.cuerpo] });
      expect(ajena.status, f).toBe(404);
      expect(ajena, 'igual que un id inexistente: no revela que la persona existe').toEqual(nada);
    }
    expect((await inscripcionDe(c.id))!.estado).toBe('pendiente');
  }, 120_000);

  it('CA-51_el_mismo_alumno_pendiente_con_A_y_con_B_se_aprueba_con_uno_y_se_rechaza_con_el_otro_sin_pisarse', async () => {
    const c = await cuentaPendiente('dos');
    const pide = await rpcCon(c.token, 'pedir_inscripcion', { p_slug: 'profesora-b', p_como_llego: 'Por la vecina' });
    expect(pide).toEqual({ status: 200, cuerpo: { profesor_id: expect.any(String), estado: 'pendiente' } });
    expect((await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: c.id })).status).toBe(200);
    const rech = await rpc('profesorB', 'rechazar_cuenta', { p_alumno_id: c.id, p_motivo: 'Sin cupo en B' });
    expect(rech.status).toBe(200);
    const ses = await rpcCon(c.token, 'sesion_actual', {});
    registrar('CA-51_estado_por_profesor', { c: c.id }, ses.cuerpo);
    expect((ses.cuerpo as { inscripciones: unknown[] }).inscripciones).toMatchObject([
      { slug: 'profesor-prueba', estado: 'aprobado', motivo_rechazo: null },
      { slug: 'profesora-b', estado: 'rechazado', motivo_rechazo: 'Sin cupo en B' },
    ]);
    // El mail de rechazo sale con el nombre y el Reply-To de B (CA-56) y el de aprobación con los de A.
    const mailB = await esperarMailConAsunto(c.mail, 'Profesora B de Prueba rechazó tu acceso');
    expect(mailB.Text).toContain('Sin cupo en B');
    expect(mailB.From.Name).toBe('Profesora B de Prueba');
    expect(mailB.ReplyTo?.map((r) => r.Address)).toEqual(['profesora.b@example.test']);
    const mailA = await esperarMailConAsunto(c.mail, 'Profesor de Prueba aprobó tu acceso');
    expect(mailA.From.Name).toBe('Profesor de Prueba');
    expect(mailA.ReplyTo?.map((r) => r.Address)).toEqual(['profesor@example.test']);
  }, 120_000);
});
