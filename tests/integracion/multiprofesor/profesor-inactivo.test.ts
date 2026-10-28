// B14 · T14.5 · profesor inactivo (CA-63 rama enlace y acceso; AGE-11, PRF-08) por la API real: su enlace dice que no toma
// reservas, nadie le pide acceso (409 PROFESOR_INACTIVO), él no aprueba ni da de alta, y lo existente y lo de B siguen igual.
// Casos: CA-63 (T-ADM-12, T-ADM-13 rama acceso, T-ADM-14 rama cuentas), CA-47. A se reactiva siempre al terminar.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { entorno } from '../../soporte/entorno';
import { rest, rpc, sesionDe, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05, profesorId } from '../cuentas/ayuda';

const cuerpoDe = (r: { cuerpo: unknown }) => r.cuerpo as Record<string, unknown>;
const HOY = '2026-11-02';

async function anon(nombre: string, args: Record<string, unknown>) {
  const e = entorno();
  const r = await fetch(`${e.apiUrl}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: e.anonKey, Authorization: `Bearer ${e.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  return { status: r.status, texto: t, cuerpo: t ? JSON.parse(t) : null };
}

const setActivo = (activo: boolean) => sql('update public.profesor set activo = $1 where slug = $2', [activo, SLUG_A]);

beforeAll(async () => {
  for (const r of ['profesor', 'profesorB', 'alumno', 'alumnoB', 'dosVinculos', 'ficha_incompleta'] as Rol[]) await sesionDe(r);
  await limpiarT05();
}, 300_000);
afterEach(async () => {
  await setActivo(true);
  await limpiarT05();
  const b = await sesionDe('alumnoB');
  await sql('delete from public.mail_salida where alumno_id = $1', [b.alumnoId]);
  await sql('delete from public.inscripcion where alumno_id = $1 and profesor_id = (select id from public.profesor where slug = $2)', [b.alumnoId, SLUG_A]);
});
afterAll(async () => {
  await setActivo(true);
  await cerrar();
});

describe('CA-63 enlace de un profesor inactivo', () => {
  it('CA-63_T-ADM-12_config_publica_solo_dice_que_no_toma_reservas_y_agenda_publica_da_409_PROFESOR_INACTIVO', async () => {
    const pa = await profesorId(SLUG_A);
    await setActivo(false);
    const c = await anon('config_publica', { p_slug: SLUG_A });
    expect(c.status, c.texto).toBe(200);
    expect(c.cuerpo).toEqual({ profesor_id: pa, nombre: 'Profesor de Prueba', activo: false });
    const a = await anon('agenda_publica', { p_slug: SLUG_A, p_dia: HOY });
    expect(a.status).toBe(409);
    expect(cuerpoDe(a).message).toBe('PROFESOR_INACTIVO');
    // Con sesión de otra persona pasa lo mismo.
    expect((await rpc('alumnoB', 'agenda_publica', { p_slug: SLUG_A, p_dia: HOY })).status).toBe(409);
  });

  it('CA-63_lo_de_B_no_cambia_con_A_inactivo_y_al_reactivar_el_enlace_de_A_vuelve_igual', async () => {
    const antesA = [(await anon('config_publica', { p_slug: SLUG_A })).texto, (await anon('agenda_publica', { p_slug: SLUG_A, p_dia: HOY })).texto];
    const antesB = [(await anon('config_publica', { p_slug: SLUG_B })).texto, (await anon('agenda_publica', { p_slug: SLUG_B, p_dia: HOY })).texto];
    await setActivo(false);
    expect([(await anon('config_publica', { p_slug: SLUG_B })).texto, (await anon('agenda_publica', { p_slug: SLUG_B, p_dia: HOY })).texto]).toEqual(antesB);
    await setActivo(true);
    expect([(await anon('config_publica', { p_slug: SLUG_A })).texto, (await anon('agenda_publica', { p_slug: SLUG_A, p_dia: HOY })).texto]).toEqual(antesA);
  });

  it('CA-63_T-ADM-12_pedir_inscripcion_y_completar_ficha_desde_el_enlace_de_A_dan_409_y_no_crean_nada', async () => {
    const b = await sesionDe('alumnoB');
    const f = await sesionDe('ficha_incompleta');
    const [{ n: mailsAntes }] = await sql<{ n: string }>('select count(*)::text n from public.mail_salida');
    await setActivo(false);
    const pedir = await rpc('alumnoB', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'Amigos' });
    expect(pedir.status, JSON.stringify(pedir.cuerpo)).toBe(409);
    expect(cuerpoDe(pedir).message).toBe('PROFESOR_INACTIVO');
    const ficha = await rpc('ficha_incompleta', 'completar_ficha', { p_nombre: 'Quique', p_telefono: '099 100 003', p_fecha_nacimiento: '1992-01-01', p_slug: SLUG_A, p_como_llego: 'Amigos' });
    expect(ficha.status, JSON.stringify(ficha.cuerpo)).toBe(409);
    expect(cuerpoDe(ficha).message).toBe('PROFESOR_INACTIVO');
    expect((await sql<{ n: string }>('select count(*)::text n from public.inscripcion where alumno_id = $1 and profesor_id = $2', [b.alumnoId, await profesorId(SLUG_A)]))[0].n).toBe('0');
    const fila = (await sql<{ estado: string; ficha_completada_en: string | null }>('select estado, ficha_completada_en::text from public.alumno where id = $1', [f.alumnoId]))[0];
    expect(fila).toEqual({ estado: 'ficha_incompleta', ficha_completada_en: null });
    expect((await sql<{ n: string }>('select count(*)::text n from public.mail_salida'))[0].n, 'ningún mail se encola').toBe(mailsAntes);
    // Con B (activo) la RPC sigue su curso normal: ya está aprobada, no hay nada que pedir.
    const aB = await rpc('alumnoB', 'pedir_inscripcion', { p_slug: SLUG_B, p_como_llego: 'Amigos' });
    expect(aB.status).toBe(409);
    expect(cuerpoDe(aB).message).toBe('CUENTA_NO_PENDIENTE');
  });
});

describe('CA-63 el profesor inactivo no aprueba ni da de alta, pero ve y opera lo existente', () => {
  it('CA-63_T-ADM-14_aprobar_y_alta_alumno_dan_409_PROFESOR_INACTIVO_y_no_cambian_nada', async () => {
    const pendiente = await crearAlumno({ nombre: 'Pendiente de A', estado: 'pendiente', telefono: '+598 99 800 001', mail: mailT05('pend') }, SLUG_A);
    const [{ n: antes }] = await sql<{ n: string }>('select count(*)::text n from public.alumno');
    await setActivo(false);
    const aprobar = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: pendiente });
    expect(aprobar.status, JSON.stringify(aprobar.cuerpo)).toBe(409);
    expect(cuerpoDe(aprobar).message).toBe('PROFESOR_INACTIVO');
    const alta = await rpc('profesor', 'alta_alumno', { p_nombre: 'T05 Nuevo', p_telefono: '+598 99 800 002', p_fecha_nacimiento: '1990-01-01', p_mail: mailT05('nuevo') });
    expect(alta.status).toBe(409);
    expect(cuerpoDe(alta).message).toBe('PROFESOR_INACTIVO');
    expect((await sql<{ estado: string }>('select estado from public.inscripcion where alumno_id = $1', [pendiente]))[0].estado).toBe('pendiente');
    expect((await sql<{ n: string }>('select count(*)::text n from public.alumno'))[0].n).toBe(antes);
  });

  it('CA-63_PRF-08_A_inactivo_sigue_entrando_y_viendo_lo_existente_y_su_sesion_lo_marca_inactivo', async () => {
    const existente = await crearAlumno({ nombre: 'Existente de A', estado: 'aprobado', telefono: '+598 99 800 003', mail: mailT05('exis') }, SLUG_A);
    await setActivo(false);
    const ses = cuerpoDe(await rpc('profesor', 'sesion_actual'));
    expect(ses.profesor).toMatchObject({ slug: SLUG_A, activo: false });
    expect(((await rest('profesor', 'GET', `v_alumnos?select=id&id=eq.${existente}`)).cuerpo as unknown[]).length).toBe(1);
    expect(((await rest('profesor', 'GET', 'grilla_tramo?select=id')).cuerpo as unknown[]).length).toBeGreaterThan(0);
    // Quien está aprobada con A conserva su vínculo y ve que el profesor está inactivo (selector).
    const d = cuerpoDe(await rpc('dosVinculos', 'sesion_actual')).inscripciones as { slug: string; estado: string; profesor_activo: boolean }[];
    expect(d.map((i) => [i.slug, i.estado, i.profesor_activo])).toEqual([
      [SLUG_A, 'aprobado', false],
      [SLUG_B, 'pendiente', true],
    ]);
  });

  it('CA-63_el_rechazo_de_una_cuenta_pendiente_si_se_permite_con_A_inactivo_(solo_aprobar_da_409)', async () => {
    const pendiente = await crearAlumno({ nombre: 'Para rechazar', estado: 'pendiente', telefono: '+598 99 800 004', mail: mailT05('rech') }, SLUG_A);
    await setActivo(false);
    const r = await rpc('profesor', 'rechazar_cuenta', { p_alumno_id: pendiente, p_motivo: 'No hay lugar' });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect((await sql<{ estado: string }>('select estado from public.inscripcion where alumno_id = $1', [pendiente]))[0].estado).toBe('rechazado');
  });
});
