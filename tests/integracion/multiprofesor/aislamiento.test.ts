// B14 · T14.5 · aislamiento entre profesores por la API real (PostgREST y RPC, como la usa la web): A no ve ni modifica
// lo de B y viceversa. Para recursos ajenos rige 404 NO_ENCONTRADO, idéntico al de un id inexistente (SEC-06, SEC-02).
// Casos: CA-52 (T-PRF-12, T-PRF-13, T-PRF-17), CA-58 (rama aislamiento de T-ALU-31), CA-62 (cada profesor ve lo suyo),
// SEC-02, SEC-06, SEC-09. Datos sintéticos con prefijo `T05 ` (se limpian). El estado de las sesiones compartidas se restaura.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rest, rpc, sesionDe, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import { crearAlumno, limpiarT05, mailT05, profesorId } from '../cuentas/ayuda';

const INEXISTENTE = '00000000-0000-0000-0000-00000000dead';
const cuerpoDe = (r: { cuerpo: unknown }) => r.cuerpo as Record<string, unknown>;

beforeAll(async () => {
  for (const r of ['profesor', 'profesorB', 'alumno', 'alumnoB', 'dosVinculos'] as Rol[]) await sesionDe(r);
  await limpiarT05();
}, 300_000);
afterEach(limpiarT05);
afterAll(cerrar);

/** Estado observable de una persona por conexión directa: inscripciones y ficha (para comprobar que nada cambió). */
async function huella(alumnoId: string): Promise<string> {
  const [f] = await sql<{ h: string }>(
    `select coalesce((select string_agg(p.slug || ':' || i.estado || ':' || coalesce(i.motivo_estado, '-'), ',' order by p.slug)
                        from public.inscripcion i join public.profesor p on p.id = i.profesor_id where i.alumno_id = a.id), '') ||
            '|' || coalesce(a.nombre, '') || '|' || coalesce(a.telefono, '') || '|' || coalesce(a.fecha_nacimiento::text, '') || '|' || coalesce(a.mail::text, '') as h
       from public.alumno a where a.id = $1`,
    [alumnoId],
  );
  return f.h;
}

describe('CA-52 / SEC-06 A no opera sobre ids de B: 404 NO_ENCONTRADO idéntico al de un id inexistente', () => {
  it('CA-52_T-PRF-13_aprobar_rechazar_sugerencias_y_editar_sobre_una_cuenta_de_B_dan_404_y_nada_cambia', async () => {
    const cuentaB = await crearAlumno({ nombre: 'Cuenta de B', estado: 'pendiente', telefono: '+598 99 700 001', mail: mailT05('cb') }, SLUG_B);
    const sinCuentaB = await crearAlumno({ nombre: 'Sin cuenta de B', estado: 'sin_cuenta', telefono: '+598 99 700 002' }, SLUG_B);
    const antes = [await huella(cuentaB), await huella(sinCuentaB)];
    const llamadas: [string, (id: string) => Record<string, unknown>][] = [
      ['aprobar_cuenta', (id) => ({ p_alumno_id: id })],
      ['rechazar_cuenta', (id) => ({ p_alumno_id: id, p_motivo: 'No' })],
      ['sugerencias_union', (id) => ({ p_alumno_id: id })],
      ['editar_alumno', (id) => ({ p_alumno_id: id, p_nombre: 'T05 Cambiado', p_telefono: '+598 99 700 003', p_fecha_nacimiento: '1990-01-01', p_mail: null })],
    ];
    for (const [nombre, args] of llamadas) {
      const patron = await rpc('profesor', nombre, args(INEXISTENTE));
      expect(patron.status, `${nombre} con id inexistente`).toBe(404);
      for (const id of [cuentaB, sinCuentaB]) {
        const r = await rpc('profesor', nombre, args(id));
        expect(r.status, `${nombre} sobre ${id}: ${JSON.stringify(r.cuerpo)}`).toBe(404);
        expect(cuerpoDe(r).message, nombre).toBe('NO_ENCONTRADO');
        expect(r.cuerpo, `${nombre}: la respuesta no distingue «ajeno» de «inexistente»`).toEqual(patron.cuerpo);
      }
    }
    const union = await rpc('profesor', 'unir_alumnos', { p_cuenta_id: cuentaB, p_sin_cuenta_id: sinCuentaB });
    const descarte = await rpc('profesor', 'descartar_union', { p_cuenta_id: cuentaB, p_sin_cuenta_id: sinCuentaB });
    expect([union.status, descarte.status]).toEqual([404, 404]);
    expect([cuerpoDe(union).message, cuerpoDe(descarte).message]).toEqual(['NO_ENCONTRADO', 'NO_ENCONTRADO']);
    expect([await huella(cuentaB), await huella(sinCuentaB)]).toEqual(antes);
  });

  it('CA-52_la_simetria_B_sobre_ids_de_A_tambien_da_404_y_nada_cambia', async () => {
    const cuentaA = await crearAlumno({ nombre: 'Cuenta de A', estado: 'pendiente', telefono: '+598 99 700 011', mail: mailT05('ca') }, SLUG_A);
    const antes = await huella(cuentaA);
    for (const nombre of ['aprobar_cuenta', 'rechazar_cuenta', 'sugerencias_union']) {
      const r = await rpc('profesorB', nombre, { p_alumno_id: cuentaA });
      expect(r.status, nombre).toBe(404);
      expect(cuerpoDe(r).message, nombre).toBe('NO_ENCONTRADO');
    }
    expect(await huella(cuentaA)).toBe(antes);
  });

  it('CA-52_T-PRF-17_A_no_edita_a_la_persona_sin_cuenta_de_B_pero_si_a_las_suyas', async () => {
    const deB = await crearAlumno({ nombre: 'Sin cuenta de B', estado: 'sin_cuenta', telefono: '+598 99 700 021' }, SLUG_B);
    const deA = await crearAlumno({ nombre: 'Sin cuenta de A', estado: 'sin_cuenta', telefono: '+598 99 700 022' }, SLUG_A);
    const ajeno = await rpc('profesor', 'editar_alumno', { p_alumno_id: deB, p_nombre: 'T05 Otro', p_telefono: '+598 99 700 021', p_fecha_nacimiento: '1990-01-01', p_mail: null });
    expect(ajeno.status).toBe(404);
    const propio = await rpc('profesor', 'editar_alumno', { p_alumno_id: deA, p_nombre: 'T05 Editado por A', p_telefono: '+598 99 700 022', p_fecha_nacimiento: '1990-01-01', p_mail: null });
    expect(propio.status, JSON.stringify(propio.cuerpo)).toBe(200);
    expect((await sql<{ nombre: string }>('select nombre from public.alumno where id = $1', [deB]))[0].nombre).toBe('T05 Sin cuenta de B');
  });

  it('SEC-06_la_baja_de_la_inscripcion_tambien_oculta_la_persona_al_profesor_(404)', async () => {
    const baja = await crearAlumno({ nombre: 'Dada de baja', estado: 'pendiente', telefono: '+598 99 700 031', mail: mailT05('baja') }, SLUG_A);
    await sql("update public.inscripcion set estado = 'baja' where alumno_id = $1", [baja]);
    expect((await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: baja })).status).toBe(404);
    expect((await rest('profesor', 'GET', `alumno?select=id&id=eq.${baja}`)).cuerpo).toEqual([]);
  });
});

describe('CA-52 / SEC-02 lecturas por PostgREST: cada profesor ve solo lo suyo', () => {
  it('CA-52_T-PRF-12_alumno_inscripcion_v_alumnos_y_persona_a_cargo_de_B_no_llegan_a_A_y_al_reves', async () => {
    const pa = await profesorId(SLUG_A);
    const pb = await profesorId(SLUG_B);
    const soloB = await crearAlumno({ nombre: 'Nora solo de B', estado: 'aprobado', telefono: '+598 99 700 041', mail: mailT05('nora') }, SLUG_B);
    const soloA = await crearAlumno({ nombre: 'Mateo solo de A', estado: 'aprobado', telefono: '+598 99 700 042', mail: mailT05('mateo') }, SLUG_A);
    await sql("insert into public.persona_a_cargo (profesor_id, alumno_id, nombre) values ($1, $2, 'T05 Hija de Nora')", [pb, soloB]);

    const vistoPorA = await rest('profesor', 'GET', 'v_alumnos?select=id,nombre');
    const vistoPorB = await rest('profesorB', 'GET', 'v_alumnos?select=id,nombre');
    const idsA = (vistoPorA.cuerpo as { id: string }[]).map((f) => f.id);
    const idsB = (vistoPorB.cuerpo as { id: string }[]).map((f) => f.id);
    expect(idsA).toContain(soloA);
    expect(idsA).not.toContain(soloB);
    expect(idsB).toContain(soloB);
    expect(idsB).not.toContain(soloA);

    for (const [rol, ajeno, deOtro] of [['profesor', soloB, pb], ['profesorB', soloA, pa]] as const) {
      expect((await rest(rol, 'GET', `alumno?select=id&id=eq.${ajeno}`)).cuerpo, `${rol}: alumno ajeno`).toEqual([]);
      expect((await rest(rol, 'GET', `inscripcion?select=alumno_id&alumno_id=eq.${ajeno}`)).cuerpo, `${rol}: inscripción ajena`).toEqual([]);
      expect((await rest(rol, 'GET', `inscripcion?select=alumno_id&profesor_id=eq.${deOtro}`)).cuerpo, `${rol}: inscripciones del otro`).toEqual([]);
      expect((await rest(rol, 'GET', `persona_a_cargo?select=id&alumno_id=eq.${ajeno}`)).cuerpo, `${rol}: persona a cargo ajena`).toEqual([]);
      expect((await rest(rol, 'GET', `v_alumnos?select=id&id=eq.${ajeno}`)).cuerpo, `${rol}: v_alumnos ajeno`).toEqual([]);
    }
    expect((await rest('profesor', 'GET', `profesor?select=id&id=eq.${pb}`)).cuerpo).toEqual([]);
    expect((await rest('profesorB', 'GET', `profesor?select=id&id=eq.${pa}`)).cuerpo).toEqual([]);
  });

  it('CA-52_la_agenda_de_cada_profesor_(grilla_bloqueos_reservas_clases_mails)_no_se_ve_desde_el_otro', async () => {
    const pa = await profesorId(SLUG_A);
    const pb = await profesorId(SLUG_B);
    for (const t of ['grilla_tramo', 'bloqueo', 'reserva', 'clase']) {
      for (const [rol, ajeno] of [['profesor', pb], ['profesorB', pa]] as const) {
        const r = await rest(rol, 'GET', `${t}?select=profesor_id&profesor_id=eq.${ajeno}`);
        expect(r.status, `${rol} ${t}`).toBe(200);
        expect(r.cuerpo, `${rol} lee ${t} del otro profesor`).toEqual([]);
      }
    }
    // mail_salida solo expone columnas sin profesor_id (H-011): se compara con los ids del otro profesor por conexión directa.
    await sql("insert into public.mail_salida (tipo, profesor_id, destinatario, asunto, cuerpo_texto, estado) values ('cuenta_nueva', $1, 't05.ajeno@example.test', 'T05 ajeno', 'x', 'enviado'), ('cuenta_nueva', $2, 't05.ajeno@example.test', 'T05 ajeno', 'x', 'enviado')", [pa, pb]);
    try {
      for (const [rol, ajeno] of [['profesor', pb], ['profesorB', pa]] as const) {
        const ajenos = (await sql<{ id: string }>('select id from public.mail_salida where profesor_id = $1', [ajeno])).map((f) => f.id);
        const vistos = ((await rest(rol, 'GET', 'mail_salida?select=id')).cuerpo as { id: string }[]).map((f) => f.id);
        expect(vistos.filter((i) => ajenos.includes(i)), `${rol} lee mail_salida del otro profesor`).toEqual([]);
      }
    } finally {
      await sql("delete from public.mail_salida where destinatario = 't05.ajeno@example.test'");
    }
    // Y lo propio sí se ve: cada profesor tiene su grilla.
    expect(((await rest('profesor', 'GET', `grilla_tramo?select=id&profesor_id=eq.${pa}`)).cuerpo as unknown[]).length).toBeGreaterThan(0);
    expect(((await rest('profesorB', 'GET', `grilla_tramo?select=id&profesor_id=eq.${pb}`)).cuerpo as unknown[]).length).toBeGreaterThan(0);
  });

  it('CA-52_la_escritura_directa_sobre_una_fila_de_B_es_rechazada_y_nada_cambia', async () => {
    const soloB = await crearAlumno({ nombre: 'Intocable de B', estado: 'aprobado', telefono: '+598 99 700 051', mail: mailT05('intocable') }, SLUG_B);
    const antes = await huella(soloB);
    const patch = await rest('profesor', 'PATCH', `alumno?id=eq.${soloB}`, { nombre: 'T05 Pisado' });
    const borrar = await rest('profesor', 'DELETE', `inscripcion?alumno_id=eq.${soloB}`);
    expect([401, 403]).toContain(patch.status);
    expect([401, 403]).toContain(borrar.status);
    expect(await huella(soloB)).toBe(antes);
  });

  it('CA-52_guardar_configuracion_y_guardar_grilla_de_A_no_tocan_a_B', async () => {
    const pb = await profesorId(SLUG_B);
    const foto = async () =>
      (
        await sql<{ f: string }>(
          `select p.duracion_min || '/' || p.anticipacion_horas || '/' || p.zona_horaria || '/' ||
                  (select count(*) || ':' || coalesce(string_agg(dia_semana || desde::text || hasta::text, ',' order by dia_semana, desde), '') from public.grilla_tramo where profesor_id = p.id) as f
             from public.profesor p where p.id = $1`,
          [pb],
        )
      )[0].f;
    const antes = await foto();
    try {
      const c = await rpc('profesor', 'guardar_configuracion', { p_duracion_min: 30, p_anticipacion_horas: 12, p_zona_horaria: 'America/Montevideo' });
      expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
      const g = await rpc('profesor', 'guardar_grilla', { p_tramos: [{ dia_semana: 1, desde: '09:00', hasta: '10:00' }] });
      expect(g.status, JSON.stringify(g.cuerpo)).toBe(200);
      expect(await foto()).toBe(antes);
    } finally {
      await rpc('profesor', 'guardar_configuracion', { p_duracion_min: 60, p_anticipacion_horas: 24, p_zona_horaria: 'America/Montevideo' });
      await rpc('profesor', 'guardar_grilla', {
        p_tramos: [1, 2, 3, 4, 5].flatMap((d) => [
          { dia_semana: d, desde: '08:00', hasta: '13:00' },
          { dia_semana: d, desde: '14:00', hasta: '18:00' },
        ]),
      });
    }
  });
});

describe('CA-58 / CA-62 una persona con dos profesores: cada vínculo es de su profesor', () => {
  it('CA-58_B_rechaza_su_inscripcion_de_la_persona_y_la_aprobada_con_A_queda_intacta_(y_al_reves)', async () => {
    const s = await sesionDe('dosVinculos');
    const restaurar = () =>
      sql(
        `update public.inscripcion set estado = case when profesor_id = (select id from public.profesor where slug = $2) then 'aprobado' else 'pendiente' end,
                motivo_estado = null where alumno_id = $1`,
        [s.alumnoId, SLUG_A],
      );
    try {
      const rechazo = await rpc('profesorB', 'rechazar_cuenta', { p_alumno_id: s.alumnoId, p_motivo: 'Motivo-B' });
      expect(rechazo.status, JSON.stringify(rechazo.cuerpo)).toBe(200);
      expect(await huella(s.alumnoId!)).toContain(`${SLUG_A}:aprobado:-,${SLUG_B}:rechazado:Motivo-B`);
      // A ve la persona aprobada y sin el motivo de B (SEC-02: el motivo es de quien lo escribió).
      const deA = (await rest('profesor', 'GET', `v_alumnos?select=estado,motivo_estado&id=eq.${s.alumnoId}`)).cuerpo as Record<string, unknown>[];
      expect(deA).toHaveLength(1);
      expect(deA[0]).toMatchObject({ estado: 'aprobado', motivo_estado: null });
      // A ya no tiene nada que aprobar (la suya está aprobada): 409; la de B no se toca.
      const otra = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: s.alumnoId });
      expect(otra.status).toBe(409);
      expect(cuerpoDe(otra).message).toBe('CUENTA_NO_PENDIENTE');
      expect(await huella(s.alumnoId!)).toContain(`${SLUG_B}:rechazado:Motivo-B`);
      // Aprobación de B: la persona queda aprobada con los dos.
      await restaurar();
      const aprobo = await rpc('profesorB', 'aprobar_cuenta', { p_alumno_id: s.alumnoId });
      expect(aprobo.status, JSON.stringify(aprobo.cuerpo)).toBe(200);
      expect(await huella(s.alumnoId!)).toContain(`${SLUG_A}:aprobado:-,${SLUG_B}:aprobado:-`);
    } finally {
      await restaurar();
    }
  });

  it('CA-62_cada_profesor_ve_el_como_llego_que_la_persona_le_dijo_a_el_y_no_el_del_otro', async () => {
    const s = await sesionDe('dosVinculos');
    try {
      await sql(
        `update public.inscripcion set como_llego = case when profesor_id = (select id from public.profesor where slug = $2) then 'Recomendación de Mateo' else 'Instagram' end where alumno_id = $1`,
        [s.alumnoId, SLUG_A],
      );
      const deA = (await rest('profesor', 'GET', `v_alumnos?select=como_llego&id=eq.${s.alumnoId}`)).cuerpo as { como_llego: string }[];
      const deB = (await rest('profesorB', 'GET', `v_alumnos?select=como_llego&id=eq.${s.alumnoId}`)).cuerpo as { como_llego: string }[];
      expect(deA.map((f) => f.como_llego)).toEqual(['Recomendación de Mateo']);
      expect(deB.map((f) => f.como_llego)).toEqual(['Instagram']);
      // La persona ve sus inscripciones y no las de otros.
      expect(((await rest('dosVinculos', 'GET', 'inscripcion?select=profesor_id')).cuerpo as unknown[]).length).toBe(2);
      expect(((await rest('alumno', 'GET', 'inscripcion?select=profesor_id')).cuerpo as unknown[]).length).toBe(1);
    } finally {
      await sql(`update public.inscripcion set como_llego = 'Amigos' where alumno_id = $1`, [s.alumnoId]);
    }
  });

  it('SEC-06_la_persona_no_ejecuta_RPC_de_profesor_ni_con_un_id_de_su_otro_profesor', async () => {
    const r = await rpc('alumno', 'aprobar_cuenta', { p_alumno_id: INEXISTENTE });
    expect(r.status).toBe(403);
  });
});
