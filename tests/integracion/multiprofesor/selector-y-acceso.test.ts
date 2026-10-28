// B14 · T14.5 · sesión con dos vínculos (selector) y pedido de acceso a un segundo profesor por la API real:
// CA-48 (T-WEB-08, lo que la web lee de `sesion_actual`), CA-51 (T-ALU-36, T-ALU-38), CA-62 (T-ALU-39), CA-58 (rama sesión),
// SEC-06, SEC-09, SEC-14. Los estados de las sesiones compartidas se restauran al terminar cada caso.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rest, rpc, sesionDe, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';

const cuerpoDe = (r: { cuerpo: unknown }) => r.cuerpo as Record<string, unknown>;
type Insc = { profesor_id: string; slug: string; profesor_nombre: string; profesor_activo: boolean; estado: string; motivo_rechazo: string | null };

beforeAll(async () => {
  for (const r of ['profesor', 'profesorB', 'administrador', 'ficha_incompleta', 'pendiente', 'rechazado', 'alumno', 'alumnoB', 'dosVinculos'] as Rol[]) await sesionDe(r);
}, 300_000);
afterEach(async () => {
  // alumnoB parte solo con B (aprobada); dosVinculos con A aprobada y B pendiente.
  const b = await sesionDe('alumnoB');
  await sql('delete from public.mail_salida where alumno_id = $1', [b.alumnoId]);
  await sql('delete from public.inscripcion where alumno_id = $1 and profesor_id = (select id from public.profesor where slug = $2)', [b.alumnoId, SLUG_A]);
  const d = await sesionDe('dosVinculos');
  await sql(
    `update public.inscripcion set estado = case when profesor_id = (select id from public.profesor where slug = $2) then 'aprobado' else 'pendiente' end, motivo_estado = null where alumno_id = $1`,
    [d.alumnoId, SLUG_A],
  );
});
afterAll(cerrar);

describe('CA-48 / CA-51 sesion_actual: lo que la web lee para decidir selector, agenda o «pedile el enlace»', () => {
  it('CA-48_T-WEB-08_la_persona_con_dos_vinculos_recibe_las_dos_inscripciones_ordenadas_por_nombre_del_profesor', async () => {
    const r = await rpc('dosVinculos', 'sesion_actual');
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const o = cuerpoDe(r);
    expect(o).toMatchObject({ rol: 'alumno', es_administrador: false, profesor: null });
    const insc = o.inscripciones as Insc[];
    expect(insc.map((i) => [i.slug, i.estado, i.profesor_activo])).toEqual([
      [SLUG_A, 'aprobado', true],
      [SLUG_B, 'pendiente', true],
    ]);
    expect(insc.map((i) => i.profesor_nombre)).toEqual([...insc.map((i) => i.profesor_nombre)].sort((x, y) => x.localeCompare(y)));
    for (const i of insc) expect(Object.keys(i).sort()).toEqual(['estado', 'motivo_rechazo', 'profesor_activo', 'profesor_id', 'profesor_nombre', 'slug']);
  });

  it('CA-48_T-WEB-08_la_persona_de_un_solo_profesor_recibe_una_inscripcion_(cae_directo_en_su_agenda)', async () => {
    const a = (cuerpoDe(await rpc('alumno', 'sesion_actual')).inscripciones as Insc[]).map((i) => [i.slug, i.estado]);
    const b = (cuerpoDe(await rpc('alumnoB', 'sesion_actual')).inscripciones as Insc[]).map((i) => [i.slug, i.estado]);
    expect(a).toEqual([[SLUG_A, 'aprobado']]);
    expect(b).toEqual([[SLUG_B, 'aprobado']]);
  });

  it('CA-48_T-WEB-07_la_persona_sin_vinculos_recibe_inscripciones_vacias_(«pedile_el_enlace_a_tu_profesor»)', async () => {
    const o = cuerpoDe(await rpc('ficha_incompleta', 'sesion_actual'));
    expect(o).toMatchObject({ rol: 'alumno', profesor: null });
    expect(o.inscripciones).toEqual([]);
  });

  it('CA-51_T-ALU-38_el_rechazo_de_un_profesor_viaja_con_su_motivo_en_su_inscripcion_y_no_en_la_de_otro', async () => {
    const d = await sesionDe('dosVinculos');
    await sql("update public.inscripcion set estado = 'rechazado', motivo_estado = 'Motivo-B' where alumno_id = $1 and profesor_id = (select id from public.profesor where slug = $2)", [d.alumnoId, SLUG_B]);
    const insc = cuerpoDe(await rpc('dosVinculos', 'sesion_actual')).inscripciones as Insc[];
    expect(insc.find((i) => i.slug === SLUG_A)).toMatchObject({ estado: 'aprobado', motivo_rechazo: null });
    expect(insc.find((i) => i.slug === SLUG_B)).toMatchObject({ estado: 'rechazado', motivo_rechazo: 'Motivo-B' });
  });

  it('CA-51_la_inscripcion_en_baja_no_viaja_a_la_sesion_(y_el_vinculo_se_puede_volver_a_pedir)', async () => {
    const d = await sesionDe('dosVinculos');
    await sql("update public.inscripcion set estado = 'baja' where alumno_id = $1 and profesor_id = (select id from public.profesor where slug = $2)", [d.alumnoId, SLUG_B]);
    expect((cuerpoDe(await rpc('dosVinculos', 'sesion_actual')).inscripciones as Insc[]).map((i) => i.slug)).toEqual([SLUG_A]);
  });

  it('CA-48_el_profesor_y_el_administrador_reciben_su_rol_sin_inscripciones_de_alumno', async () => {
    const p = cuerpoDe(await rpc('profesor', 'sesion_actual'));
    expect(p).toMatchObject({ rol: 'profesor', es_administrador: false });
    expect(p.profesor).toMatchObject({ slug: SLUG_A, activo: true });
    const pb = cuerpoDe(await rpc('profesorB', 'sesion_actual'));
    expect(pb.profesor).toMatchObject({ slug: SLUG_B, activo: true });
    const ad = cuerpoDe(await rpc('administrador', 'sesion_actual'));
    expect(ad).toMatchObject({ rol: 'administrador', es_administrador: true, profesor: null, nombre: null });
  });
});

describe('CA-51 / CA-62 pedir_inscripcion: el segundo profesor, sin repetir la ficha', () => {
  it('CA-51_T-ALU-38_la_persona_aprobada_con_B_pide_acceso_a_A_y_queda_pendiente_solo_con_A_con_su_como_llego', async () => {
    const b = await sesionDe('alumnoB');
    const r = await rpc('alumnoB', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'Instagram' });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(cuerpoDe(r)).toMatchObject({ estado: 'pendiente' });
    const insc = (await sql<{ slug: string; estado: string; como_llego: string }>(
      'select p.slug, i.estado, i.como_llego from public.inscripcion i join public.profesor p on p.id = i.profesor_id where i.alumno_id = $1 order by p.slug',
      [b.alumnoId],
    ));
    expect(insc.map((i) => `${i.slug}:${i.estado}:${i.como_llego}`)).toEqual([`${SLUG_A}:pendiente:Instagram`, `${SLUG_B}:aprobado:Amigos`]);
    // La sesión la muestra con los dos profesores (selector) y la ficha no se tocó.
    expect((cuerpoDe(await rpc('alumnoB', 'sesion_actual')).inscripciones as Insc[]).map((i) => [i.slug, i.estado])).toEqual([
      [SLUG_A, 'pendiente'],
      [SLUG_B, 'aprobado'],
    ]);
    // CA-62: A ve su como_llego; B ve el suyo.
    expect(((await rest('profesor', 'GET', `v_alumnos?select=estado,como_llego&id=eq.${b.alumnoId}`)).cuerpo as Record<string, unknown>[])[0]).toMatchObject({ estado: 'pendiente', como_llego: 'Instagram' });
    expect(((await rest('profesorB', 'GET', `v_alumnos?select=estado,como_llego&id=eq.${b.alumnoId}`)).cuerpo as Record<string, unknown>[])[0]).toMatchObject({ estado: 'aprobado', como_llego: 'Amigos' });
  });

  it('CA-62_T-ALU-39_el_aviso_del_pedido_llega_solo_al_profesor_del_enlace', async () => {
    const b = await sesionDe('alumnoB');
    expect((await rpc('alumnoB', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'Recomendación de Mateo' })).status).toBe(200);
    const avisos = await sql<{ slug: string; tipo: string }>(
      'select p.slug, m.tipo from public.mail_salida m join public.profesor p on p.id = m.profesor_id where m.alumno_id = $1',
      [b.alumnoId],
    );
    expect(avisos).toEqual([{ slug: SLUG_A, tipo: 'cuenta_nueva' }]);
  });

  it('CA-51_pedir_dos_veces_o_pedir_con_quien_ya_aprobo_da_409_CUENTA_NO_PENDIENTE_y_no_cambia_nada', async () => {
    const d = await sesionDe('dosVinculos');
    for (const slug of [SLUG_A, SLUG_B]) {
      const r = await rpc('dosVinculos', 'pedir_inscripcion', { p_slug: slug, p_como_llego: 'Otra vez' });
      expect(r.status, `${slug}: ${JSON.stringify(r.cuerpo)}`).toBe(409);
      expect(cuerpoDe(r).message).toBe('CUENTA_NO_PENDIENTE');
    }
    const [{ n }] = await sql<{ n: string }>("select count(*)::text n from public.inscripcion where alumno_id = $1 and como_llego = 'Otra vez'", [d.alumnoId]);
    expect(n).toBe('0');
  });

  it('CA-51_slug_inexistente_404_y_como_llego_invalido_422_sin_efectos', async () => {
    const b = await sesionDe('alumnoB');
    const inexistente = await rpc('alumnoB', 'pedir_inscripcion', { p_slug: 'no-existe-nadie', p_como_llego: 'Amigos' });
    expect(inexistente.status).toBe(404);
    expect(cuerpoDe(inexistente).message).toBe('NO_ENCONTRADO');
    const vacio = await rpc('alumnoB', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: '   ' });
    expect(vacio.status).toBe(422);
    const largo = await rpc('alumnoB', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'x'.repeat(201) });
    expect(largo.status).toBe(422);
    const [{ n }] = await sql<{ n: string }>('select count(*)::text n from public.inscripcion where alumno_id = $1', [b.alumnoId]);
    expect(n).toBe('1');
  });

  it('CA-51_T-ALU-36_sin_ficha_completa_no_se_pide_acceso_(403_FICHA_INCOMPLETA)_y_profesores_y_administrador_tampoco_(403)', async () => {
    const f = await rpc('ficha_incompleta', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'Amigos' });
    expect(f.status).toBe(403);
    expect(cuerpoDe(f).message).toBe('FICHA_INCOMPLETA');
    for (const rol of ['profesor', 'profesorB', 'administrador'] as Rol[]) {
      const r = await rpc(rol, 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'Amigos' });
      expect(r.status, rol).toBe(403);
    }
  });

  it('SEC-14_anon_no_pide_acceso', async () => {
    const r = await rpc('anon', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'Amigos' });
    expect([401, 403]).toContain(r.status);
  });
});
