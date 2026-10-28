// B14 · T14.5 · alta asociada (DEC-29 b, CA-61 rama alumno) por la API real: un profesor da de alta con el mail de una
// persona que ya tiene cuenta por otro profesor. No se crea otra cuenta, la ficha no cambia y queda aprobada con quien
// dio el alta. Casos: CA-61 (T-ALU-32, T-ALU-33), CA-58 (rama alta), SEC-02, SEC-09. Datos sintéticos; se restauran.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rest, rpc, sesionDe, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import { limpiarT05 } from '../cuentas/ayuda';

const cuerpoDe = (r: { cuerpo: unknown }) => r.cuerpo as Record<string, unknown>;
type Insc = { slug: string; estado: string };

beforeAll(async () => {
  for (const r of ['profesor', 'profesorB', 'administrador', 'alumno', 'ficha_incompleta'] as Rol[]) await sesionDe(r);
  await limpiarT05();
}, 300_000);

/** Deja a las personas de prueba como las entrega tests/soporte/usuarios.ts. */
async function restaurar() {
  for (const rol of ['alumno', 'ficha_incompleta'] as Rol[]) {
    const s = await sesionDe(rol);
    await sql('delete from public.mail_salida where alumno_id = $1', [s.alumnoId]);
    await sql('delete from public.inscripcion where alumno_id = $1 and profesor_id = (select id from public.profesor where slug = $2)', [s.alumnoId, SLUG_B]);
  }
  const f = await sesionDe('ficha_incompleta');
  await sql("update public.alumno set estado = 'ficha_incompleta', nombre = null, telefono = null, fecha_nacimiento = null, ficha_completada_en = null, ficha_origen_profesor_id = null where id = $1", [f.alumnoId]);
}
afterEach(restaurar);
afterAll(async () => {
  await restaurar();
  await cerrar();
});

const ficha = (alumnoId: string) =>
  sql<{ nombre: string; telefono: string; fecha_nacimiento: string; mail: string; estado: string }>(
    'select nombre, telefono, fecha_nacimiento::text, mail::text, estado from public.alumno where id = $1',
    [alumnoId],
  ).then((f) => f[0]);

describe('CA-61 alta con el mail de una persona que ya tiene cuenta por otro profesor (DEC-29 b)', () => {
  it('CA-61_T-ALU-32_B_da_de_alta_a_la_persona_de_A_y_queda_aprobada_con_B_sin_otra_cuenta_ni_cambios_en_su_ficha', async () => {
    const s = await sesionDe('alumno');
    const antes = await ficha(s.alumnoId!);
    const [{ n: cuentas }] = await sql<{ n: string }>('select count(*)::text n from public.alumno where lower(mail::text) = lower($1)', [s.mail]);
    const r = await rpc('profesorB', 'alta_alumno', { p_nombre: 'Nombre que B cree', p_telefono: '+598 91 000 000', p_fecha_nacimiento: '1980-02-02', p_mail: s.mail!.toUpperCase() });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(cuerpoDe(r)).toMatchObject({ alumno_id: s.alumnoId, estado: 'aprobado', asociado: true });

    // La ficha de la persona no cambió y no hay otra fila con ese mail.
    expect(await ficha(s.alumnoId!)).toEqual(antes);
    expect((await sql<{ n: string }>('select count(*)::text n from public.alumno where lower(mail::text) = lower($1)', [s.mail]))[0].n).toBe(cuentas);

    // Aprobada con los dos; la inscripción con A no se tocó.
    const insc = await sql<Insc>('select p.slug, i.estado from public.inscripcion i join public.profesor p on p.id = i.profesor_id where i.alumno_id = $1 order by p.slug', [s.alumnoId]);
    expect(insc).toEqual([
      { slug: SLUG_A, estado: 'aprobado' },
      { slug: SLUG_B, estado: 'aprobado' },
    ]);
    // B la ve con la ficha de la persona; la persona ve a los dos en su sesión (selector).
    const deB = (await rest('profesorB', 'GET', `v_alumnos?select=id,nombre,estado&id=eq.${s.alumnoId}`)).cuerpo as Record<string, unknown>[];
    expect(deB).toHaveLength(1);
    expect(deB[0]).toMatchObject({ nombre: antes.nombre, estado: 'aprobado' });
    expect(((cuerpoDe(await rpc('alumno', 'sesion_actual')).inscripciones as Insc[]) ?? []).map((i) => i.slug)).toEqual([SLUG_A, SLUG_B]);
    // El aviso «te sumaron» sale solo de B y a esa persona (AVI-04).
    const avisos = await sql<{ slug: string; tipo: string; destinatario: string }>(
      'select p.slug, m.tipo, m.destinatario::text from public.mail_salida m join public.profesor p on p.id = m.profesor_id where m.alumno_id = $1',
      [s.alumnoId],
    );
    expect(avisos.map((a) => [a.slug, a.tipo, a.destinatario.toLowerCase()])).toEqual([[SLUG_B, 'alumno_sumado', s.mail!.toLowerCase()]]);
  });

  it('CA-61_repetir_el_alta_da_409_MAIL_YA_REGISTRADO_con_el_alumno_id_de_la_aprobada_con_quien_llama', async () => {
    const s = await sesionDe('alumno');
    const base = { p_nombre: 'Otra vez', p_telefono: '+598 91 000 001', p_fecha_nacimiento: '1980-02-02', p_mail: s.mail };
    // A ya la tiene aprobada: 409 con su id (el profesor ya la conoce, no se filtra nada nuevo).
    const deA = await rpc('profesor', 'alta_alumno', base);
    expect(deA.status).toBe(409);
    expect(cuerpoDe(deA).message).toBe('MAIL_YA_REGISTRADO');
    expect(JSON.stringify(cuerpoDe(deA).details)).toContain(s.alumnoId!);
    expect((await rpc('profesorB', 'alta_alumno', base)).status, 'B la asocia la primera vez').toBe(200);
    const deB = await rpc('profesorB', 'alta_alumno', base);
    expect(deB.status).toBe(409);
    expect(JSON.stringify(cuerpoDe(deB).details)).toContain(s.alumnoId!);
  });

  it('CA-61_T-ALU-33_con_el_mail_de_un_profesor_o_del_administrador_el_409_no_trae_datos_de_nadie_y_no_se_crea_nada', async () => {
    const pa = (await sesionDe('profesor')).mail!;
    const ad = (await sesionDe('administrador')).mail!;
    const [{ n: antes }] = await sql<{ n: string }>('select count(*)::text n from public.alumno');
    for (const mail of [pa, ad]) {
      const r = await rpc('profesorB', 'alta_alumno', { p_nombre: 'Intruso', p_telefono: '+598 91 000 002', p_fecha_nacimiento: '1980-02-02', p_mail: mail });
      expect(r.status, mail).toBe(409);
      expect(cuerpoDe(r).message).toBe('MAIL_YA_REGISTRADO');
      expect(JSON.stringify(r.cuerpo)).not.toMatch(/alumno_id|Alumno alumno|\+598 99123456/);
    }
    expect((await sql<{ n: string }>('select count(*)::text n from public.alumno'))[0].n).toBe(antes);
  });

  it('CA-61_la_persona_con_ficha_incompleta_responde_asociado_false_y_no_fija_ficha_completada_en_(no_cuenta_en_el_tope_ALU-13)', async () => {
    // Desvío documentado del Developer (handoff-developer-2, diferencia 3): una cuenta sin ficha no tiene datos que respetar.
    const s = await sesionDe('ficha_incompleta');
    const r = await rpc('profesorB', 'alta_alumno', { p_nombre: 'Cargada por B', p_telefono: '+598 91 000 003', p_fecha_nacimiento: '1980-02-02', p_mail: s.mail });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(cuerpoDe(r)).toMatchObject({ asociado: false });
    const f = await sql<{ ficha_completada_en: string | null }>('select ficha_completada_en::text from public.alumno where id = $1', [s.alumnoId]);
    expect(f[0].ficha_completada_en).toBeNull();
    const [{ n }] = await sql<{ n: string }>('select count(*)::text n from public.alumno where lower(mail::text) = lower($1)', [s.mail]);
    expect(n, 'no se crea otra cuenta con ese mail').toBe('1');
  });

  it('CA-58_el_alta_es_de_quien_la_hace_A_no_ve_la_inscripcion_de_B_ni_su_aviso', async () => {
    const s = await sesionDe('alumno');
    expect((await rpc('profesorB', 'alta_alumno', { p_nombre: 'X', p_telefono: '+598 91 000 004', p_fecha_nacimiento: '1980-02-02', p_mail: s.mail })).status).toBe(200);
    // El profesor A solo ve su vínculo (la inscripción de B no aparece) y los mails de B no están en su registro.
    const insc = (await rest('profesor', 'GET', `inscripcion?select=profesor_id&alumno_id=eq.${s.alumnoId}`)).cuerpo as unknown[];
    expect(insc).toHaveLength(1);
    const [{ id: pb }] = await sql<{ id: string }>('select id from public.profesor where slug = $1', [SLUG_B]);
    const deB = await sql<{ id: string }>('select id from public.mail_salida where profesor_id = $1 and alumno_id = $2', [pb, s.alumnoId]);
    const vistoPorA = ((await rest('profesor', 'GET', 'mail_salida?select=id')).cuerpo as { id: string }[]).map((f) => f.id);
    expect(deB.length).toBeGreaterThan(0);
    expect(vistoPorA.filter((i) => deB.map((d) => d.id).includes(i))).toEqual([]);
  });
});
