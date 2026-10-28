// B07 · T07.3 · Vistas v_mis_clases (persona), v_clases y v_solicitudes_pendientes (profesor) por la API real, con dos profesores.
// Casos del plan: T-RES-12/13/14/15/16 (parte de datos), T-SOL-02 (parte de datos), T-SOL-15, T-SOL-16, T-PRF-09, T-PRF-10, T-PRF-11.
// CA: CA-20, CA-21, CA-25, CA-26, CA-29, CA-45 (rama Mis clases), CA-53, CA-55. IDs: RES-06, PRF-06, ALU-03, SOL-08, SEC-02, SEC-05,
// SEC-16. Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo; la profesora B trabaja en Europe/Madrid.
// Datos sintéticos de las sesiones compartidas; lo que crean se limpia al terminar.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj } from '../../soporte/reloj';
import { rest, rpc, sesionDe, ROLES, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import { VISTAS, VISTAS_ESPERADAS } from '../seguridad/matriz/07';
import { AHORA, alumnoDe, idsProfesores, leer, limpiarB07, madrid, mensaje, pedirReserva, prepararB07, registrar, responder, slot, terminarB07, type Ids } from './ayuda';

let ids: Ids;

beforeAll(async () => {
  for (const r of ROLES) await sesionDe(r);
  ids = await idsProfesores();
  await prepararB07();
}, 300_000);
afterEach(async () => {
  await fijarReloj(AHORA);
  await sql(`update public.profesor set zona_horaria = 'America/Montevideo'`);
  await sql(`delete from public.inscripcion where alumno_id = $1 and profesor_id = $2`, [await alumnoDe('alumno'), ids.PB]);
  await sql(`update public.inscripcion set motivo_estado = 'Motivo de prueba' where estado = 'rechazado'`);
  await limpiarB07();
});
afterAll(async () => {
  await terminarB07();
  await cerrar();
});

interface FilaMia {
  id: string;
  inicio: string;
  estado: string;
  quien_toma: string;
  observacion: string | null;
  pasada: boolean;
  profesor_id: string;
  profesor_nombre: string | null;
  profesor_slug: string | null;
  zona_horaria: string | null;
  solicitud_pendiente: { id: string; tipo: string; alcance: string | null; vencida: boolean } | null;
  reserva_tipo: string;
  frecuencia: number | null;
}
interface FilaClase {
  id: string;
  alumno_id: string;
  inicio: string;
  estado: string;
  titular: string | null;
  quien_toma: string | null;
  observacion: string | null;
  pasada: boolean;
  profesor_id: string;
  solicitud_pendiente: { id: string; vencida: boolean } | null;
}
interface FilaPendiente {
  id: string;
  fecha_clase: string;
  vencida: boolean;
  titular: string | null;
  alumno_id: string;
  profesor_id: string;
  reserva_tipo: string;
}

/** Siembra común (reloj en 2026-11-02): el alumno tiene 1 confirmada y 1 pendiente con A; dosVinculos 1 confirmada con A; alumnoB 1 pendiente con B. */
async function sembrar(): Promise<{ alumnoConfirmada: string; alumnoPendiente: string; dosConfirmada: string; deB: string }> {
  const a1 = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'), { p_observacion: 'Primera vez' });
  const a2 = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '11:00'));
  const d1 = await pedirReserva('dosVinculos', ids.PA, slot('2026-11-04', '12:00'));
  const b1 = await pedirReserva('alumnoB', ids.PB, slot('2026-11-04', '10:00'));
  for (const r of [a1, a2, d1, b1]) expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  expect((await responder('profesor', a1.solicitudId!, 'confirmar')).status).toBe(200);
  expect((await responder('profesor', d1.solicitudId!, 'confirmar')).status).toBe(200);
  return { alumnoConfirmada: a1.solicitudId!, alumnoPendiente: a2.solicitudId!, dosConfirmada: d1.solicitudId!, deB: b1.solicitudId! };
}

describe('SEC-02 / SEC-05 / CA-26 / CA-55 qué ve cada rol en las tres vistas nuevas (matriz 07.ts)', () => {
  it('SEC-02_cada_rol_ve_solo_lo_suyo_en_v_mis_clases_v_clases_y_v_solicitudes_pendientes_con_dos_profesores', async () => {
    await sembrar();
    const obtenido: Record<string, Record<string, number>> = {};
    for (const rol of ROLES) {
      obtenido[rol] = {};
      for (const vista of VISTAS) {
        const r = await rest(rol, 'GET', vista);
        const esperado = VISTAS_ESPERADAS[rol][vista];
        if (esperado === -1) {
          expect([401, 403], `${rol} ${vista}: ${r.status}`).toContain(r.status);
          obtenido[rol][vista] = -1;
        } else {
          expect(r.status, `${rol} ${vista}: ${JSON.stringify(r.cuerpo)}`).toBe(200);
          obtenido[rol][vista] = (r.cuerpo as unknown[]).length;
          expect(obtenido[rol][vista], `${rol} ${vista}`).toBe(esperado);
        }
      }
    }
    registrar('SEC-02_vistas', { siembra: 'alumno 2, dosVinculos 1 con A; alumnoB 1 con B' }, obtenido);
  });

  it('CA-26_CA-55_una_persona_no_lee_las_clases_de_otra_ni_un_profesor_las_del_otro_ni_por_id', async () => {
    const s = await sembrar();
    const [dosClase] = await sql<{ id: string }>(`select c.id from public.clase c join public.solicitud so on so.reserva_id = c.reserva_id where so.id = $1`, [s.dosConfirmada]);
    const [bClase] = await sql<{ id: string }>(`select c.id from public.clase c join public.solicitud so on so.reserva_id = c.reserva_id where so.id = $1`, [s.deB]);
    expect(await leer('alumno', 'v_mis_clases', `id=eq.${dosClase.id}`)).toEqual([]);
    expect(await leer('dosVinculos', 'v_mis_clases', `id=eq.${dosClase.id}`)).toHaveLength(1);
    expect(await leer('profesorB', 'v_clases', `id=eq.${dosClase.id}`)).toEqual([]);
    expect(await leer('profesor', 'v_clases', `id=eq.${bClase.id}`)).toEqual([]);
    expect(await leer('profesor', 'v_solicitudes_pendientes', `id=eq.${s.deB}`)).toEqual([]);
    expect(await leer('profesorB', 'v_solicitudes_pendientes', `id=eq.${s.alumnoPendiente}`)).toEqual([]);
  });

  it('SEC-05_las_vistas_son_de_solo_lectura_para_la_API_(PATCH_y_DELETE_dan_403)', async () => {
    await sembrar();
    for (const [rol, vista] of [
      ['alumno', 'v_mis_clases'],
      ['profesor', 'v_clases'],
      ['profesor', 'v_solicitudes_pendientes'],
    ] as [Rol, string][]) {
      const p = await rest(rol, 'PATCH', `${vista}?id=not.is.null`, vista === 'v_solicitudes_pendientes' ? { alcance: 'serie' } : { estado: 'confirmada' });
      const d = await rest(rol, 'DELETE', `${vista}?id=not.is.null`);
      expect([p.status, d.status], `${rol} ${vista}`).toEqual([403, 403]);
    }
    expect((await leer<FilaMia>('alumno', 'v_mis_clases', 'estado=eq.pendiente')).length).toBe(1);
  });
});

describe('CA-20 / RES-06 Mis clases: próximas, pasadas y pendientes con quién toma, observación y estado', () => {
  it('CA-20_T-RES-12_T-RES-14_Mis_clases_trae_la_confirmada_la_pendiente_con_su_solicitud_y_la_pasada_marcada_por_app_ahora', async () => {
    await sembrar();
    const al = await alumnoDe('alumno');
    // Una clase pasada confirmada (historial), sembrada por SQL: la aplicación solo crea clases con 24 h de anticipación.
    await sql(`insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
               values ('a0700000-0000-0000-0000-0000000001e1', $1, $2, 'suelta', '10:00', 2, 60, 'confirmada', '2026-10-20', 'solicitud')`, [ids.PA, al]);
    await sql(`insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado, confirmada_en)
               values ($1, 'a0700000-0000-0000-0000-0000000001e1', $2, '2026-10-20 10:00-03', '2026-10-20 11:00-03', 'confirmada', '2026-10-10 12:00-03')`, [ids.PA, al]);
    const filas = await leer<FilaMia>('alumno', 'v_mis_clases', 'order=inicio.asc');
    registrar('CA-20_T-RES-12', { alumno: 'alumno', reloj: AHORA }, filas);
    expect(filas.map((f) => [f.estado, f.pasada, f.quien_toma, f.profesor_nombre])).toEqual([
      ['confirmada', true, 'Alumno alumno', 'Profesor de Prueba'],
      ['confirmada', false, 'Alumno alumno', 'Profesor de Prueba'],
      ['pendiente', false, 'Alumno alumno', 'Profesor de Prueba'],
    ]);
    expect(filas[1].observacion).toBe('Primera vez');
    expect(filas[1].solicitud_pendiente).toBeNull();
    expect(filas[2].solicitud_pendiente).toMatchObject({ tipo: 'reserva', vencida: false });
    expect(filas[0].solicitud_pendiente).toBeNull();
  });

  it('CA-20_T-RES-13_T-RES-16_Mis_clases_es_solo_de_la_persona_que_la_pide', async () => {
    await sembrar();
    expect((await leer<FilaMia>('dosVinculos', 'v_mis_clases')).map((f) => f.profesor_slug)).toEqual([SLUG_A]);
    expect((await leer<FilaMia>('alumnoB', 'v_mis_clases')).map((f) => [f.profesor_slug, f.estado])).toEqual([[SLUG_B, 'pendiente']]);
    expect(await leer('rechazado', 'v_mis_clases')).toEqual([]);
  });

  it('CA-20_la_persona_a_cargo_aparece_como_quien_toma_la_clase_y_la_observacion_con_html_llega_como_texto_(SEC-16)', async () => {
    const alta = await rpc('alumno', 'guardar_persona_a_cargo', { p_id: null, p_nombre: 'T06 Niña <b>T07</b>', p_fecha_nacimiento: '2015-05-05' });
    expect(alta.status, JSON.stringify(alta.cuerpo)).toBe(200);
    const [pac] = await sql<{ id: string }>(`select id from public.persona_a_cargo where nombre like 'T06 Ni%'`);
    const html = '<script>alert("x")</script> Primera vez';
    const p = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'), { p_persona_a_cargo_id: pac.id, p_observacion: html });
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    const [m] = await leer<FilaMia>('alumno', 'v_mis_clases');
    const [c] = await leer<FilaClase>('profesor', 'v_clases');
    const [s] = await leer<{ quien_toma: string; observacion: string }>('profesor', 'v_solicitudes_pendientes');
    registrar('CA-20_SEC-16', { observacion: html }, { mis_clases: m, v_clases: c, pendiente: s });
    expect([m.quien_toma, m.observacion]).toEqual(['T06 Niña <b>T07</b>', html]);
    expect([c.titular, c.quien_toma, c.observacion]).toEqual(['Alumno alumno', 'T06 Niña <b>T07</b>', html]);
    expect([s.quien_toma, s.observacion]).toEqual(['T06 Niña <b>T07</b>', html]);
  });
});

describe('CA-53 / RES-06 Mis clases con dos profesores y husos distintos', () => {
  it('CA-53_T-RES-15_un_alumno_aprobado_con_A_y_con_B_ve_las_clases_de_los_dos_cada_una_con_su_profesor_y_su_huso', async () => {
    const al = await alumnoDe('alumno');
    await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, $2, 'aprobado', now())`, [al, ids.PB]);
    await sql(`update public.profesor set zona_horaria = 'Europe/Madrid' where id = $1`, [ids.PB]);
    const a = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'));
    const b = await pedirReserva('alumno', ids.PB, madrid('2026-11-05', '10:00'));
    const b2 = await pedirReserva('alumno', ids.PB, madrid('2026-11-06', '10:00'));
    for (const r of [a, b, b2]) expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect((await responder('profesor', a.solicitudId!, 'confirmar')).status).toBe(200);
    expect((await responder('profesorB', b.solicitudId!, 'confirmar')).status).toBe(200);
    expect((await responder('profesorB', b2.solicitudId!, 'rechazar', 'No puedo ese día')).status).toBe(200);
    const filas = await leer<FilaMia>('alumno', 'v_mis_clases', 'order=inicio.asc');
    registrar('CA-53', { alumno: 'alumno aprobado con A y B', B: 'Europe/Madrid' }, filas.map((f) => ({ inicio: f.inicio, estado: f.estado, profesor: f.profesor_nombre, slug: f.profesor_slug, zona: f.zona_horaria })));
    expect(filas.map((f) => [f.profesor_nombre, f.profesor_slug, f.zona_horaria, f.estado])).toEqual([
      ['Profesor de Prueba', SLUG_A, 'America/Montevideo', 'confirmada'],
      ['Profesora B de Prueba', SLUG_B, 'Europe/Madrid', 'confirmada'],
      ['Profesora B de Prueba', SLUG_B, 'Europe/Madrid', 'rechazada'],
    ]);
    expect(filas[1].inicio.replace('+00:00', 'Z')).toBe('2026-11-05T09:00:00Z');
    expect(filas.map((f) => f.profesor_id)).toEqual([ids.PA, ids.PB, ids.PB]);
    // Un cambio de huso del profesor de la copia llega a la vista sin tocar las clases.
    await sql(`update public.profesor set zona_horaria = 'America/Argentina/Buenos_Aires' where id = $1`, [ids.PB]);
    expect((await leer<FilaMia>('alumno', 'v_mis_clases', `profesor_id=eq.${ids.PB}`)).map((f) => f.zona_horaria)).toEqual(['America/Argentina/Buenos_Aires', 'America/Argentina/Buenos_Aires']);
  });
});

describe('CA-45 rama de Mis clases: el motivo del profesor que rechazó, como texto', () => {
  it('CA-45_ALU-03_la_sesion_trae_el_motivo_de_A_sin_transformar_y_sin_motivo_solo_el_estado', async () => {
    const al = await alumnoDe('rechazado'); // la persona sembrada del rol, no cualquier rechazada que haya dejado otro archivo
    const html = '<img src=x onerror=alert(1)> sin cupo';
    await sql(`update public.inscripcion set motivo_estado = $3 where alumno_id = $1 and profesor_id = $2`, [al, ids.PA, html]);
    const con = await rpc('rechazado', 'sesion_actual', {});
    await sql(`update public.inscripcion set motivo_estado = null where alumno_id = $1 and profesor_id = $2`, [al, ids.PA]);
    const sin = await rpc('rechazado', 'sesion_actual', {});
    const ins = (r: { cuerpo: unknown }) => (r.cuerpo as { inscripciones: { slug: string; estado: string; motivo_rechazo: string | null; nombre?: string }[] }).inscripciones;
    registrar('CA-45', { motivo: html }, { con: ins(con), sin: ins(sin) });
    expect(ins(con)).toMatchObject([{ slug: SLUG_A, estado: 'rechazado', motivo_rechazo: html }]);
    expect(ins(sin)).toMatchObject([{ slug: SLUG_A, estado: 'rechazado', motivo_rechazo: null }]);
    expect(await leer('rechazado', 'v_mis_clases')).toEqual([]);
  });
});

describe('CA-21 / PRF-06 la solicitud nueva está en la lista del profesor de la solicitud', () => {
  it('CA-21_T-SOL-02_la_solicitud_aparece_en_la_lista_de_A_ordenada_por_fecha_con_quien_toma_y_no_en_la_de_B', async () => {
    const tarde = await pedirReserva('dosVinculos', ids.PA, slot('2026-11-05', '10:00'));
    const temprano = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'), { p_tipo: 'serie', p_frecuencia: 2 });
    const deB = await pedirReserva('alumnoB', ids.PB, slot('2026-11-04', '10:00'));
    for (const r of [tarde, temprano, deB]) expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const a = await leer<FilaPendiente & { quien_toma: string; frecuencia: number | null }>('profesor', 'v_solicitudes_pendientes');
    const b = await leer<FilaPendiente>('profesorB', 'v_solicitudes_pendientes');
    registrar('CA-21_T-SOL-02', { solicitudes: ['serie quincenal 11-04', 'suelta 11-05', 'B suelta'] }, { A: a, B: b });
    expect(a.map((s) => [s.id, s.reserva_tipo, s.vencida, s.titular])).toEqual([
      [temprano.solicitudId, 'serie', false, 'Alumno alumno'],
      [tarde.solicitudId, 'suelta', false, 'Alumno dosVinculos'],
    ]);
    expect(a[0].frecuencia).toBe(2);
    expect(b.map((s) => s.id)).toEqual([deB.solicitudId]);
    expect(a.every((s) => s.profesor_id === ids.PA) && b.every((s) => s.profesor_id === ids.PB)).toBe(true);
    // Ocupado en el calendario público de ese profesor y libre en el del otro.
    const pub = await rpc('anon', 'agenda_publica', { p_slug: SLUG_A, p_dia: '2026-11-05' });
    expect((pub.cuerpo as { estado: string }[]).some((h) => h.estado === 'ocupado')).toBe(true);
  });
});

describe('CA-25 / SOL-08 pendiente sin respuesta cuyo horario ya pasó (reloj fijo)', () => {
  it('CA-25_T-SOL-15_T-SOL-16_un_minuto_antes_sigue_pendiente_y_pasado_el_horario_figura_vencida_y_responder_da_409_SOLICITUD_VENCIDA', async () => {
    const p = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00')); // 13:00Z
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    const id = p.solicitudId!;
    const estado = async () => ({
      lista: (await leer<FilaPendiente>('profesor', 'v_solicitudes_pendientes', `id=eq.${id}`))[0]?.vencida,
      misClases: (await leer<FilaMia>('alumno', 'v_mis_clases', `solicitud_pendiente->>id=eq.${id}`)).map((f) => [f.estado, f.pasada, f.solicitud_pendiente?.vencida]),
      clases: (await leer<FilaClase>('profesor', 'v_clases', `solicitud_pendiente->>id=eq.${id}`)).map((f) => [f.estado, f.pasada, f.solicitud_pendiente?.vencida]),
    });
    await fijarReloj('2026-11-04T12:59:00Z');
    const antes = await estado();
    await fijarReloj('2026-11-04T13:00:00Z'); // el límite: fecha_clase <= app_ahora()
    const limite = await estado();
    await fijarReloj('2026-11-04T13:01:00Z');
    const despues = await estado();
    const confirmar = await responder('profesor', id, 'confirmar');
    const rechazar = await responder('profesor', id, 'rechazar');
    registrar('CA-25', { fecha_clase: '2026-11-04T13:00:00Z', relojes: ['12:59', '13:00', '13:01'] }, { antes, limite, despues, confirmar: [confirmar.status, confirmar.cuerpo], rechazar: [rechazar.status, rechazar.cuerpo] });
    expect(antes).toEqual({ lista: false, misClases: [['pendiente', false, false]], clases: [['pendiente', false, false]] });
    expect(limite).toEqual({ lista: true, misClases: [['pendiente', true, true]], clases: [['pendiente', true, true]] });
    expect(despues).toEqual({ lista: true, misClases: [['pendiente', true, true]], clases: [['pendiente', true, true]] });
    for (const r of [confirmar, rechazar]) expect([r.status, mensaje(r)]).toEqual([409, 'SOLICITUD_VENCIDA']);
    const [s] = await sql<{ estado: string; c: string }>(`select s.estado, (select c.estado from public.clase c where c.reserva_id = s.reserva_id) as c from public.solicitud s where s.id = $1`, [id]);
    expect(s).toEqual({ estado: 'pendiente', c: 'pendiente' });
  });
});

describe('CA-29 / PRF-06 la lista de clases del profesor filtra por rango y por alumno e incluye las pasadas', () => {
  async function pasada(rol: Rol, dia: string, id: string) {
    const al = await alumnoDe(rol);
    await sql(`insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
               values ($1, $2, $3, 'suelta', '10:00', extract(isodow from $4::date)::smallint, 60, 'confirmada', $4::date, 'solicitud')`, [id, ids.PA, al, dia]);
    await sql(`insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado, confirmada_en)
               values ($1, $2, $3, ($4::date + time '10:00') at time zone 'America/Montevideo', ($4::date + time '11:00') at time zone 'America/Montevideo', 'confirmada', '2026-10-01 12:00-03')`, [ids.PA, id, al, dia]);
  }

  it('CA-29_T-PRF-09_T-PRF-10_T-PRF-11_rango_alumno_ambos_pasadas_rango_invertido_alumno_inexistente_y_el_otro_profesor', async () => {
    await pasada('alumno', '2026-10-20', 'a0700000-0000-0000-0000-0000000001f1');
    await pasada('dosVinculos', '2026-10-21', 'a0700000-0000-0000-0000-0000000001f2');
    await sembrar();
    const al = await alumnoDe('alumno');
    const dos = await alumnoDe('dosVinculos');
    const octubre = 'inicio=gte.2026-10-01T03:00:00Z&inicio=lt.2026-11-01T03:00:00Z';
    const rango = await leer<FilaClase>('profesor', 'v_clases', `${octubre}&order=inicio.asc`);
    const rangoAlumno = await leer<FilaClase>('profesor', 'v_clases', `${octubre}&alumno_id=eq.${al}`);
    const soloAlumno = await leer<FilaClase>('profesor', 'v_clases', `alumno_id=eq.${al}&order=inicio.asc`);
    const todas = await leer<FilaClase>('profesor', 'v_clases');
    const invertido = await leer('profesor', 'v_clases', 'inicio=gte.2026-11-30T00:00:00Z&inicio=lt.2026-11-01T00:00:00Z');
    const inexistente = await leer('profesor', 'v_clases', 'alumno_id=eq.00000000-0000-0000-0000-00000000dead');
    const deB = await leer('profesorB', 'v_clases', `alumno_id=eq.${al}`);
    registrar('CA-29', { rango: 'octubre 2026', alumno: 'alumno' }, { rango: rango.length, rangoAlumno: rangoAlumno.length, soloAlumno: soloAlumno.length, todas: todas.length, invertido, inexistente, deB });
    expect(rango.map((c) => [c.alumno_id, c.pasada, c.estado])).toEqual([[al, true, 'confirmada'], [dos, true, 'confirmada']]);
    expect(rangoAlumno.map((c) => c.alumno_id)).toEqual([al]);
    expect(soloAlumno.map((c) => [c.estado, c.pasada])).toEqual([['confirmada', true], ['confirmada', false], ['pendiente', false]]);
    expect(todas).toHaveLength(5); // dos pasadas + la confirmada y la pendiente del alumno + la confirmada de dosVinculos
    expect(todas.every((c) => c.profesor_id === ids.PA)).toBe(true);
    expect(todas.find((c) => c.alumno_id === al && c.estado === 'pendiente')!.solicitud_pendiente).toMatchObject({ vencida: false });
    expect(invertido).toEqual([]);
    expect(inexistente).toEqual([]);
    expect(deB, 'B filtrando por un alumno de A no recibe filas').toEqual([]);
  });
});
