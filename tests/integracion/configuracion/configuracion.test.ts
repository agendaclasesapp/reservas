// B10 · T10.3 · Configuración de la agenda y bloqueos por la API real (PostgREST local, como la usa la web) con dos profesores.
// Casos del plan: CA-12 (T-AGE-04, T-AGE-05), CA-13 (T-AGE-09), CA-14 (T-AGE-10, T-AGE-11, T-AGE-12), CA-52 (desbloquear ajeno 404),
// CA-54 (un bloqueo o una configuración de A no cambia la agenda de B), SEC-06, SEC-09 (H-015, H-394, H-140). IDs: AGE-03, AGE-04, AGE-05, AGE-06, PRF-04.
// Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo. Datos sintéticos de las sesiones compartidas; lo que crean se limpia.
// Los extremos con el reloj completo y la serie con cambio de huso (H-393) están además en supabase/tests/10_configuracion_bloqueos.test.sql.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj } from '../../soporte/reloj';
import { rest, rpc, sesionDe, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import {
  AHORA,
  alumnoDe,
  asegurarSesionProfesor,
  crear,
  DESDE_MIN_A,
  DESDE_MIN_A_MENOS_1S,
  detalle,
  detalleJson,
  EXTREMO_A,
  EXTREMO_A_MAS_1D,
  EXTREMO_A_MAS_1S,
  EXTREMO_B,
  EXTREMO_B_MAS_1D,
  EXTREMO_B_MAS_1S,
  idsProfesores,
  mensaje,
  pedirReserva,
  PREFIJO_MOTIVO,
  prepararB10,
  limpiarB10,
  registrar,
  slot,
  terminarB10,
  type Ids,
} from './ayuda';

let ids: Ids;
const ROLES_USADOS: Rol[] = ['alumno', 'alumnoB', 'dosVinculos', 'profesor', 'profesorB', 'administrador'];
const INEXISTENTE = '00000000-0000-0000-0000-00000000dead';
const MOTIVO = `${PREFIJO_MOTIVO}Médico`;

beforeAll(async () => {
  await asegurarSesionProfesor();
  for (const r of ROLES_USADOS) await sesionDe(r);
  ids = await idsProfesores();
  await prepararB10();
}, 300_000);
afterEach(async () => {
  await fijarReloj(AHORA);
  await sql("update public.profesor set duracion_min = 60, anticipacion_horas = 24, zona_horaria = 'America/Montevideo', activo = true where slug = $1", [SLUG_A]);
  await sql("update public.profesor set duracion_min = 60, anticipacion_horas = 24, zona_horaria = 'Europe/Madrid', activo = true where slug = $1", [SLUG_B]);
  await limpiarB10();
});
afterAll(async () => {
  await sql("update public.profesor set zona_horaria = 'America/Montevideo' where slug = $1", [SLUG_B]);
  await terminarB10();
  await cerrar();
});

const bloquear = (rol: Rol, desde: string, hasta: string, motivo: string | null = MOTIVO) => rpc(rol, 'bloquear', { p_desde: desde, p_hasta: hasta, p_motivo: motivo });
const desbloquear = (rol: Rol, id: string) => rpc(rol, 'desbloquear', { p_bloqueo_id: id });
const config = (rol: Rol, duracion: number, anticipacion: number, zona: string) =>
  rpc(rol, 'guardar_configuracion', { p_duracion_min: duracion, p_anticipacion_horas: anticipacion, p_zona_horaria: zona });
const publica = async (slug: string, dia: string) => {
  const r = await rpc('anon', 'agenda_publica', { p_slug: slug, p_dia: dia });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return r.cuerpo as { inicio: string; fin: string; estado: string }[];
};
const nBloqueos = async (profesorId: string) => (await sql<{ n: number }>('select count(*)::int as n from public.bloqueo where profesor_id = $1', [profesorId]))[0].n;
const clases = (profesorId: string) =>
  sql<{ k: string }>(
    `select to_char(inicio at time zone 'UTC', 'MM-DD HH24:MI') || '>' || to_char(fin at time zone 'UTC', 'MM-DD HH24:MI') || ':' || estado as k from public.clase where profesor_id = $1 order by inicio`,
    [profesorId],
  );

describe('CA-12 / AGE-03 cambiar la duración no mueve clases ni solicitudes', () => {
  it('CA-12_T-AGE-04_con_clase_confirmada_y_solicitud_pendiente_pasar_a_90_min_conserva_sus_horarios_y_regenera_los_huecos', async () => {
    const alumnoId = await alumnoDe('alumno');
    const c = await crear('profesor', { p_alumno_id: alumnoId, p_inicio: slot('2026-11-03', '09:00'), p_tipo: 'suelta' });
    expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
    const p = await pedirReserva('dosVinculos', ids.PA, slot('2026-11-03', '15:00'));
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    const antes = await clases(ids.PA);
    expect(antes.map((f) => f.k)).toEqual(['11-03 12:00>11-03 13:00:confirmada', '11-03 18:00>11-03 19:00:pendiente']);

    const r = await config('profesor', 90, 24, 'America/Montevideo');
    registrar('CA-12_T-AGE-04', { p_duracion_min: 90, p_anticipacion_horas: 24, p_zona_horaria: 'America/Montevideo' }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(r.cuerpo).toMatchObject({ duracion_min: 90, anticipacion_horas: 24, zona_horaria: 'America/Montevideo' });

    expect(await clases(ids.PA), 'la clase y la solicitud conservan inicio, fin y estado').toEqual(antes);
    const sol = await sql<{ estado: string }>('select estado from public.solicitud where id = $1', [p.solicitudId]);
    expect(sol[0].estado).toBe('pendiente');
    const huecos = await publica(SLUG_A, '2026-11-03');
    expect(huecos).toHaveLength(5); // 3 de mañana y 2 de tarde con 90 min
    expect(huecos.every((h) => new Date(h.fin).getTime() - new Date(h.inicio).getTime() === 90 * 60_000)).toBe(true);
    expect(huecos.filter((h) => h.estado === 'libre').length).toBeGreaterThanOrEqual(1);
    registrar('CA-12_T-AGE-04_huecos', { dia: '2026-11-03' }, huecos);
  });

  it('CA-12_T-AGE-05_SEC-06_un_alumno_no_cambia_la_duracion_(403)_ni_anon_ni_el_administrador', async () => {
    const entrada = { p_duracion_min: 30, p_anticipacion_horas: 24, p_zona_horaria: 'America/Montevideo' };
    const alumno = await config('alumno', 30, 24, 'America/Montevideo');
    registrar('CA-12_T-AGE-05', entrada, { status: alumno.status, cuerpo: alumno.cuerpo });
    expect(alumno.status).toBe(403);
    expect(mensaje(alumno)).toBe('PROHIBIDO');
    expect((await config('administrador', 30, 24, 'America/Montevideo')).status).toBe(403);
    expect([401, 403]).toContain((await config('anon', 30, 24, 'America/Montevideo')).status);
    const [f] = await sql<{ duracion_min: number }>('select duracion_min from public.profesor where id = $1', [ids.PA]);
    expect(f.duracion_min).toBe(60);
  });

  it('CA-54_la_configuracion_de_A_no_cambia_la_de_B_y_viceversa', async () => {
    const r = await config('profesor', 45, 6, 'Asia/Tokyo');
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const clave = (id: string) => sql<{ k: string }>("select duracion_min || '|' || anticipacion_horas || '|' || zona_horaria as k from public.profesor where id = $1", [id]);
    expect((await clave(ids.PB))[0].k).toBe('60|24|Europe/Madrid');
    const r2 = await config('profesorB', 120, 48, 'Europe/Madrid');
    expect(r2.status, JSON.stringify(r2.cuerpo)).toBe(200);
    expect((await clave(ids.PA))[0].k).toBe('45|6|Asia/Tokyo');
  });

  it('SEC-09_H-140_la_anticipacion_llega_a_8784_horas_y_8785_da_422_con_campo_p_anticipacion_horas', async () => {
    const ok = await config('profesor', 60, 8784, 'America/Montevideo');
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    for (const valor of [8785, -1]) {
      const r = await config('profesor', 60, valor, 'America/Montevideo');
      registrar('H-140', { p_anticipacion_horas: valor }, { status: r.status, cuerpo: r.cuerpo });
      expect(r.status, `anticipación ${valor}`).toBe(422);
      expect(detalle(r).campo).toBe('p_anticipacion_horas');
    }
    const dur = await config('profesor', 0, 24, 'America/Montevideo');
    expect([dur.status, detalle(dur).campo]).toEqual([422, 'p_duracion_min']);
    const zona = await config('profesor', 60, 24, 'Mars/Olympus');
    expect([zona.status, detalle(zona).campo]).toEqual([422, 'p_zona_horaria']);
    const [f] = await sql<{ anticipacion_horas: number }>('select anticipacion_horas from public.profesor where id = $1', [ids.PA]);
    expect(f.anticipacion_horas, 'los 422 no cambiaron lo guardado').toBe(8784);
  });
});

describe('CA-13 / AGE-04 la anticipación mínima limita al alumno y no al profesor', () => {
  it('CA-13_T-AGE-09_el_alumno_no_puede_a_+20_h_con_anticipacion_24_y_el_profesor_si_crea_la_clase', async () => {
    await fijarReloj('2026-11-08T15:00:00Z'); // domingo 12:00 de Montevideo: el lunes 09/11 08:00 queda a +20 h
    const inicio = slot('2026-11-09', '08:00');
    const alumnoId = await alumnoDe('alumno');
    const rechazo = await pedirReserva('alumno', ids.PA, inicio);
    registrar('CA-13_T-AGE-09_alumno', { p_profesor_id: ids.PA, p_inicio: inicio, anticipacion_horas: 24, ahora: '2026-11-08T15:00:00Z' }, { status: rechazo.status, cuerpo: rechazo.cuerpo });
    expect(rechazo.status, JSON.stringify(rechazo.cuerpo)).toBe(422);
    expect((rechazo.cuerpo as { message: string }).message).toBe('ANTICIPACION_INSUFICIENTE');
    expect((await sql('select 1 from public.solicitud where alumno_id = $1', [alumnoId])).length, 'el rechazo no creó solicitud').toBe(0);

    const creada = await crear('profesor', { p_alumno_id: alumnoId, p_inicio: inicio, p_tipo: 'suelta' });
    registrar('CA-13_T-AGE-09_profesor', { p_alumno_id: '<alumno>', p_inicio: inicio, p_tipo: 'suelta' }, { status: creada.status, cuerpo: creada.cuerpo });
    expect(creada.status, JSON.stringify(creada.cuerpo)).toBe(200);
    expect((await clases(ids.PA)).map((f) => f.k)).toEqual(['11-09 11:00>11-09 12:00:confirmada']);
  });

  it('CA-13_AGE-04_el_limite_exacto_(+24_h)_se_acepta_y_bajar_la_anticipacion_a_12_h_deja_reservar_a_+20_h', async () => {
    await fijarReloj('2026-11-08T15:00:00Z');
    const limite = await pedirReserva('alumno', ids.PA, slot('2026-11-09', '12:00'));
    expect(limite.status, JSON.stringify(limite.cuerpo)).toBe(200);
    const antes = await pedirReserva('dosVinculos', ids.PA, slot('2026-11-09', '08:00'));
    expect(antes.status).toBe(422);
    const baja = await config('profesor', 60, 12, 'America/Montevideo');
    expect(baja.status, JSON.stringify(baja.cuerpo)).toBe(200);
    const despues = await pedirReserva('dosVinculos', ids.PA, slot('2026-11-09', '08:00'));
    expect(despues.status, JSON.stringify(despues.cuerpo)).toBe(200);
  });
});

describe('CA-14 / AGE-05 bloqueos: conflictos, vista pública y quitar', () => {
  it('CA-14_T-AGE-10_bloquear_un_rango_que_cubre_una_clase_o_una_solicitud_da_409_y_lo_indica_sin_crear_bloqueo', async () => {
    const alumnoId = await alumnoDe('alumno');
    expect((await crear('profesor', { p_alumno_id: alumnoId, p_inicio: slot('2026-11-03', '09:00'), p_tipo: 'suelta' })).status).toBe(200);
    expect((await pedirReserva('dosVinculos', ids.PA, slot('2026-11-03', '15:00'))).status).toBe(200);

    const sobreClase = await bloquear('profesor', slot('2026-11-03', '08:00'), slot('2026-11-03', '10:00'));
    registrar('CA-14_T-AGE-10_clase', { p_desde: slot('2026-11-03', '08:00'), p_hasta: slot('2026-11-03', '10:00') }, { status: sobreClase.status, cuerpo: sobreClase.cuerpo });
    expect(sobreClase.status).toBe(409);
    expect(mensaje(sobreClase)).toBe('BLOQUEO_CON_RESERVAS');
    const lista1 = detalleJson(sobreClase) as { clase_id: string; inicio: string; estado: string; alumno: string | null }[];
    expect(lista1).toHaveLength(1);
    expect(lista1[0]).toMatchObject({ estado: 'confirmada' });
    expect(lista1[0].alumno).toEqual(expect.any(String));
    expect(new Date(lista1[0].inicio).toISOString()).toBe('2026-11-03T12:00:00.000Z');

    const sobreSolicitud = await bloquear('profesor', slot('2026-11-03', '14:00'), slot('2026-11-03', '16:00'));
    registrar('CA-14_T-AGE-10_solicitud', { p_desde: slot('2026-11-03', '14:00'), p_hasta: slot('2026-11-03', '16:00') }, { status: sobreSolicitud.status, cuerpo: sobreSolicitud.cuerpo });
    expect(sobreSolicitud.status).toBe(409);
    expect((detalleJson(sobreSolicitud) as { estado: string }[]).map((c) => c.estado)).toEqual(['pendiente']);

    const ambas = await bloquear('profesor', slot('2026-11-03', '08:00'), slot('2026-11-03', '18:00'));
    expect((detalleJson(ambas) as { estado: string }[]).map((c) => c.estado)).toEqual(['confirmada', 'pendiente']);
    expect(await nBloqueos(ids.PA), 'ningún 409 creó un bloqueo').toBe(0);
    const borde = await bloquear('profesor', slot('2026-11-03', '10:00'), slot('2026-11-03', '11:00'));
    expect(borde.status, 'el borde no es conflicto: la clase termina a las 10:00').toBe(200);
  });

  it('CA-14_T-AGE-11_AGE-06_bloquear_los_huecos_figuran_bloqueados_en_la_vista_publica_y_al_quitar_vuelven_a_libres', async () => {
    const antes = await publica(SLUG_A, '2026-11-10'); // martes
    expect(antes.filter((h) => h.estado === 'libre')).toHaveLength(9);
    const entrada = { p_desde: slot('2026-11-10', '10:00'), p_hasta: slot('2026-11-10', '12:00'), p_motivo: MOTIVO };
    const r = await bloquear('profesor', entrada.p_desde, entrada.p_hasta);
    registrar('CA-14_T-AGE-11_bloquear', entrada, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const id = (r.cuerpo as { bloqueo_id: string }).bloqueo_id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);

    const durante = await publica(SLUG_A, '2026-11-10');
    expect(durante.filter((h) => h.estado === 'bloqueado').map((h) => new Date(h.inicio).toISOString())).toEqual(['2026-11-10T13:00:00.000Z', '2026-11-10T14:00:00.000Z']);
    expect(durante.filter((h) => h.estado === 'libre')).toHaveLength(7);
    expect(JSON.stringify(durante), 'la vista pública no trae el motivo').not.toContain(PREFIJO_MOTIVO);
    const panel = await rpc('profesor', 'agenda_profesor', { p_dia: '2026-11-10' });
    expect((panel.cuerpo as { bloqueo_motivo: string | null }[]).filter((f) => f.bloqueo_motivo === MOTIVO)).toHaveLength(2);

    const q = await desbloquear('profesor', id);
    registrar('CA-14_T-AGE-11_quitar', { p_bloqueo_id: id }, { status: q.status, cuerpo: q.cuerpo });
    expect(q.status, JSON.stringify(q.cuerpo)).toBe(204);
    const despues = await publica(SLUG_A, '2026-11-10');
    expect(despues.filter((h) => h.estado === 'libre')).toHaveLength(9);
    expect((await desbloquear('profesor', id)).status, 'quitar dos veces da 404').toBe(404);
  });

  it('CA-14_T-AGE-12_SEC-06_un_alumno_no_puede_crear_ni_quitar_bloqueos_(403)_y_no_queda_nada', async () => {
    const entrada = { p_desde: slot('2026-11-10', '10:00'), p_hasta: slot('2026-11-10', '12:00'), p_motivo: MOTIVO };
    const r = await bloquear('alumno', entrada.p_desde, entrada.p_hasta);
    registrar('CA-14_T-AGE-12', entrada, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(403);
    expect(mensaje(r)).toBe('PROHIBIDO');
    expect((await bloquear('administrador', entrada.p_desde, entrada.p_hasta)).status).toBe(403);
    expect([401, 403]).toContain((await bloquear('anon', entrada.p_desde, entrada.p_hasta)).status);
    expect((await desbloquear('alumno', INEXISTENTE)).status).toBe(403);
    expect(await nBloqueos(ids.PA)).toBe(0);
    const hecho = await bloquear('profesor', entrada.p_desde, entrada.p_hasta);
    const id = (hecho.cuerpo as { bloqueo_id: string }).bloqueo_id;
    expect((await desbloquear('alumno', id)).status, 'una persona no quita el bloqueo').toBe(403);
    expect(await nBloqueos(ids.PA)).toBe(1);
  });

  it('CA-14_SEC-09_H-394_motivo_de_501_caracteres_da_422_con_campo_motivo_y_sin_fechas_o_invertido_da_422_con_su_campo', async () => {
    const largo = await bloquear('profesor', slot('2026-11-10', '10:00'), slot('2026-11-10', '11:00'), `${PREFIJO_MOTIVO}${'x'.repeat(497)}`);
    expect([largo.status, detalle(largo).campo]).toEqual([422, 'motivo']);
    const justo = await bloquear('profesor', slot('2026-11-10', '10:00'), slot('2026-11-10', '11:00'), `${PREFIJO_MOTIVO}${'x'.repeat(496)}`);
    expect(justo.status, '500 caracteres pasan').toBe(200);
    const sinDesde = await rpc('profesor', 'bloquear', { p_desde: null, p_hasta: slot('2026-11-10', '11:00') });
    expect([sinDesde.status, detalle(sinDesde).campo]).toEqual([422, 'p_desde']);
    const invertido = await bloquear('profesor', slot('2026-11-10', '13:00'), slot('2026-11-10', '12:00'));
    expect([invertido.status, detalle(invertido).campo]).toEqual([422, 'p_hasta']);
    expect(await nBloqueos(ids.PA)).toBe(1);
  });
});

describe('SEC-09 / H-015 / H-394 topes: p_hasta hasta 00:00 de hoy + 367, p_desde desde hoy - 366, rango de hasta 366 días', () => {
  it('H-394_p_hasta_en_el_extremo_pasa_y_un_segundo_o_un_dia_mas_da_422_con_campo_p_hasta_(profesor_A_Montevideo)', async () => {
    const desde = slot('2027-01-01', '00:00');
    const ok = await bloquear('profesor', desde, EXTREMO_A);
    registrar('H-394_extremo_A', { p_desde: desde, p_hasta: EXTREMO_A }, { status: ok.status, cuerpo: ok.cuerpo });
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    for (const [nombre, hasta] of [['mas_1_s', EXTREMO_A_MAS_1S], ['mas_1_dia', EXTREMO_A_MAS_1D]] as const) {
      const r = await bloquear('profesor', desde, hasta);
      registrar(`H-394_${nombre}`, { p_desde: desde, p_hasta: hasta }, { status: r.status, cuerpo: r.cuerpo });
      expect(r.status, nombre).toBe(422);
      expect(mensaje(r)).toBe('DATOS_INVALIDOS');
      expect(detalle(r)).toEqual({ campo: 'p_hasta' });
    }
    expect(await nBloqueos(ids.PA), 'solo el del extremo quedó escrito').toBe(1);
  });

  it('H-394_el_extremo_se_mide_en_el_huso_del_profesor_(profesora_B_Madrid)', async () => {
    await sql("update public.profesor set zona_horaria = 'Europe/Madrid' where slug = $1", [SLUG_B]);
    const desde = '2027-01-01T00:00:00+01:00';
    const ok = await bloquear('profesorB', desde, EXTREMO_B);
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    for (const hasta of [EXTREMO_B_MAS_1S, EXTREMO_B_MAS_1D]) {
      const r = await bloquear('profesorB', desde, hasta);
      expect([r.status, detalle(r).campo], hasta).toEqual([422, 'p_hasta']);
    }
    // 00:00 de Montevideo del mismo día son las 04:00 de Madrid: ya pasa del extremo de B.
    const demasiado = await bloquear('profesorB', desde, EXTREMO_A);
    expect([demasiado.status, detalle(demasiado).campo]).toEqual([422, 'p_hasta']);
  });

  it('H-394_p_desde_de_hoy_-_366_pasa_y_un_segundo_antes_da_422_con_campo_p_desde', async () => {
    const hasta = '2025-11-02T00:00:00-03:00';
    const ok = await bloquear('profesor', DESDE_MIN_A, hasta);
    registrar('H-394_desde_min', { p_desde: DESDE_MIN_A, p_hasta: hasta }, { status: ok.status, cuerpo: ok.cuerpo });
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    const r = await bloquear('profesor', DESDE_MIN_A_MENOS_1S, hasta);
    registrar('H-394_desde_min_menos_1s', { p_desde: DESDE_MIN_A_MENOS_1S, p_hasta: hasta }, { status: r.status, cuerpo: r.cuerpo });
    expect([r.status, detalle(r).campo]).toEqual([422, 'p_desde']);
    expect(await nBloqueos(ids.PA)).toBe(1);
  });

  it('SEC-09_un_rango_de_exactamente_366_dias_pasa_y_uno_de_367_da_422_con_campo_p_hasta', async () => {
    const ok = await bloquear('profesor', '2026-11-02T00:00:00-03:00', '2027-11-03T00:00:00-03:00');
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    const mas = await bloquear('profesor', '2026-11-01T00:00:00-03:00', '2027-11-03T00:00:00-03:00');
    registrar('SEC-09_rango_367', { p_desde: '2026-11-01T00:00:00-03:00', p_hasta: '2027-11-03T00:00:00-03:00' }, { status: mas.status, cuerpo: mas.cuerpo });
    expect([mas.status, detalle(mas).campo]).toEqual([422, 'p_hasta']);
  });
});

describe('CA-52 / CA-54 dos profesores: cada uno ve y quita solo sus bloqueos', () => {
  it('CA-52_B_no_ve_los_bloqueos_de_A_y_su_desbloquear_da_404_igual_que_un_id_inexistente_sin_quitar_nada', async () => {
    const r = await bloquear('profesor', slot('2026-11-10', '10:00'), slot('2026-11-10', '12:00'));
    const id = (r.cuerpo as { bloqueo_id: string }).bloqueo_id;
    expect((await rest('profesorB', 'GET', `bloqueo?select=id&id=eq.${id}`)).cuerpo, 'B no ve el bloqueo de A (RLS)').toEqual([]);
    expect(((await rest('profesor', 'GET', `bloqueo?select=id&id=eq.${id}`)).cuerpo as unknown[]).length).toBe(1);
    const ajeno = await desbloquear('profesorB', id);
    const inexistente = await desbloquear('profesorB', INEXISTENTE);
    registrar('CA-52_desbloquear_ajeno', { p_bloqueo_id: id, como: 'profesorB' }, { status: ajeno.status, cuerpo: ajeno.cuerpo });
    expect(ajeno.status).toBe(404);
    expect(mensaje(ajeno)).toBe('NO_ENCONTRADO');
    expect(ajeno.cuerpo, 'la respuesta no distingue «ajeno» de «inexistente»').toEqual(inexistente.cuerpo);
    expect(await nBloqueos(ids.PA), 'el bloqueo de A sigue').toBe(1);
    await rest('profesorB', 'DELETE', `bloqueo?id=eq.${id}`); // tampoco por la tabla
    expect(await nBloqueos(ids.PA)).toBe(1);
  });

  it('CA-54_un_bloqueo_de_A_no_cambia_la_agenda_de_B_y_los_dos_pueden_bloquear_el_mismo_instante', async () => {
    const antesB = await publica(SLUG_B, '2026-11-10');
    const a = await bloquear('profesor', slot('2026-11-10', '10:00'), slot('2026-11-10', '12:00'));
    expect(a.status, JSON.stringify(a.cuerpo)).toBe(200);
    expect(await publica(SLUG_B, '2026-11-10'), 'la agenda pública de B no cambió').toEqual(antesB);
    const panelB = await rpc('profesorB', 'agenda_profesor', { p_dia: '2026-11-10' });
    expect((panelB.cuerpo as { estado: string }[]).filter((f) => f.estado === 'bloqueado')).toHaveLength(0);
    const b = await bloquear('profesorB', slot('2026-11-10', '10:00'), slot('2026-11-10', '12:00'));
    expect(b.status, JSON.stringify(b.cuerpo)).toBe(200);
    expect(await nBloqueos(ids.PA)).toBe(1);
    expect(await nBloqueos(ids.PB)).toBe(1);
    expect((await desbloquear('profesor', (a.cuerpo as { bloqueo_id: string }).bloqueo_id)).status).toBe(204);
    expect(await nBloqueos(ids.PB), 'al quitar el de A, el de B sigue').toBe(1);
  });
});
