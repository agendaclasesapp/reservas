// B09 · T09.3 · Gestión directa del profesor y panel por la API real (PostgREST local, como la usa la web) con dos profesores, y los mails al
// titular en Mailpit. Casos del plan: CA-21 (T-SOL-02), CA-27, CA-28, CA-30 (T-AVI-02, T-AVI-04), CA-52 (rama panel), CA-55, CA-63 (lado del
// profesor), SEC-06, SEC-09. IDs: PRF-01..PRF-05, PRF-07, PRF-08, AVI-01, AVI-02, AVI-04, DEC-32.
// SEC-28 (extender_series con series del profesor) se prueba en supabase/tests/09_gestion.test.sql (corre el job con el reloj de la base).
// Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo. Datos sintéticos de las sesiones compartidas; lo que crean se limpia al terminar.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj } from '../../soporte/reloj';
import { rpc, sesionDe, MAIL_PROFESOR, SLUG_A, type Rol } from '../../soporte/usuarios';
import {
  AHORA,
  alumnoDe,
  asegurarSesionProfesor,
  claseDe,
  crear,
  detalle,
  esperarNuevo,
  estados,
  idsProfesores,
  leer,
  limpiarB09,
  mailsA,
  mensaje,
  pedirReserva,
  prepararB09,
  PREFIJO_NOMBRE,
  registrar,
  slot,
  terminarB09,
  type Ids,
} from './ayuda';

let ids: Ids;
const ROLES_USADOS: Rol[] = ['alumno', 'alumnoB', 'dosVinculos', 'pendiente', 'profesor', 'profesorB', 'administrador'];
const PROFESOR_NOMBRE = 'Profesor de Prueba';
const DEAD = '00000000-0000-0000-0000-00000000dead';

beforeAll(async () => {
  await asegurarSesionProfesor();
  for (const r of ROLES_USADOS) await sesionDe(r);
  ids = await idsProfesores();
  await prepararB09();
}, 300_000);
afterEach(async () => {
  await fijarReloj(AHORA);
  await sql('update public.profesor set activo = true');
  await limpiarB09();
});
afterAll(async () => {
  await terminarB09();
  await cerrar();
});

const mover = (rol: Rol, id: string, destino: string, alcance: string) => rpc(rol, 'mover_clase', { p_clase_id: id, p_destino: destino, p_alcance: alcance });
const cancelar = (rol: Rol, id: string, alcance: string) => rpc(rol, 'cancelar_clase', { p_clase_id: id, p_alcance: alcance });
const contadores = async (rol: Rol) => {
  const r = await rpc(rol, 'contadores');
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return r.cuerpo as { solicitudes_pendientes: number; cuentas_pendientes: number };
};
interface FilaAgenda {
  estado: string;
  clase_id: string | null;
  titular: string | null;
  quien_toma: string | null;
  observacion: string | null;
  clase_estado: string | null;
  reserva_tipo: string | null;
}
const agenda = async (rol: Rol, dia: string) => {
  const r = await rpc(rol, 'agenda_profesor', { p_dia: dia });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return r.cuerpo as FilaAgenda[];
};
async function cargar(nombre: string, mail?: string) {
  const r = await rpc('profesor', 'alta_alumno', { p_nombre: `${PREFIJO_NOMBRE}${nombre}`, p_telefono: '+598 96 000 333', p_fecha_nacimiento: '1990-01-01', p_mail: mail ?? null });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return (r.cuerpo as { alumno_id: string }).alumno_id;
}
async function personaACargo(alumnoId: string, nombre: string): Promise<string> {
  return (await sql<{ id: string }>(`insert into public.persona_a_cargo (alumno_id, nombre, fecha_nacimiento) values ($1, $2, '2015-03-04') returning id`, [alumnoId, nombre]))[0].id;
}

describe('CA-27 / PRF-01 crear clases para una persona sin cuenta y para una aprobada', () => {
  it('CA-27_T-AVI-04_crear_para_una_persona_sin_cuenta_queda_confirmada_sin_solicitud_ni_mail_y_ocupa_el_hueco', async () => {
    const sc = await cargar('Sin cuenta');
    const entrada = { p_alumno_id: sc, p_inicio: slot('2026-11-03', '10:00'), p_tipo: 'suelta', p_observacion: 'Primera clase' };
    const r = await crear('profesor', entrada);
    registrar('CA-27_sin_cuenta', entrada, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(r.cuerpo).toMatchObject({ fechas: [expect.any(String)], salteadas: [] });
    expect(await estados(sc)).toEqual({ '11-03 10:00': 'confirmada' });
    expect((await sql(`select 1 from public.solicitud where alumno_id = $1`, [sc])).length).toBe(0);
    const fila = (await agenda('profesor', '2026-11-03')).find((f) => f.clase_id !== null)!;
    expect(fila).toMatchObject({ estado: 'ocupado', titular: `${PREFIJO_NOMBRE}Sin cuenta`, observacion: 'Primera clase', clase_estado: 'confirmada', reserva_tipo: 'suelta' });
    expect((await sql(`select 1 from public.mail_salida where alumno_id = $1 and tipo = 'clase_creada'`, [sc])).length, 'T-AVI-04: sin cuenta no hay mail').toBe(0);
  });

  it('CA-27_PRF-04_crear_no_aplica_la_anticipacion_(la_clase_es_dentro_de_5_h_con_24_h_configuradas)', async () => {
    const sc = await cargar('Sin anticipacion');
    const r = await crear('profesor', { p_alumno_id: sc, p_inicio: slot('2026-11-02', '17:00'), p_tipo: 'suelta' });
    registrar('PRF-04', { inicio: slot('2026-11-02', '17:00') }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(await estados(sc)).toEqual({ '11-02 17:00': 'confirmada' });
  });

  it('CA-30_T-AVI-02_crear_para_una_persona_aprobada_manda_un_mail_con_el_nombre_del_profesor_como_remitente_y_su_Reply-To', async () => {
    const al = await sesionDe('alumno');
    const asunto = `${PROFESOR_NOMBRE} te reservó una clase`;
    const antes = await mailsA(al.mail!, asunto);
    const r = await crear('profesor', { p_alumno_id: al.alumnoId, p_inicio: slot('2026-11-03', '11:00'), p_tipo: 'suelta' });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const m = await esperarNuevo(al.mail!, asunto, antes);
    registrar('CA-30_T-AVI-02_creada', { para: al.mail, asunto }, { from: m.From, replyTo: m.ReplyTo, texto: m.Text });
    expect(m.From.Name).toContain(PROFESOR_NOMBRE);
    expect(m.ReplyTo?.map((x) => x.Address)).toEqual([MAIL_PROFESOR]);
    expect(m.Text).toContain('Hola');
    expect(await mailsA(al.mail!, asunto)).toBe(antes + 1);
  }, 60_000);

  it('CA-30_T-AVI-04_una_persona_aprobada_sin_mail_recibe_la_clase_y_no_se_encola_ningun_mail', async () => {
    const ap = await cargar('Aprobada', `t05.sinmail.${Date.now()}@example.test`);
    await sql('update public.alumno set mail = null where id = $1', [ap]);
    const r = await crear('profesor', { p_alumno_id: ap, p_inicio: slot('2026-11-03', '12:00'), p_tipo: 'suelta' });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect((await sql(`select 1 from public.mail_salida where alumno_id = $1 and tipo = 'clase_creada'`, [ap])).length).toBe(0);
  });
});

describe('CA-27 / CA-30 serie creada, movida una vez y cancelada desde una fecha', () => {
  it('CA-27_la_serie_se_crea_se_mueve_solo_una_vez_y_se_cancela_desde_una_fecha_con_un_mail_por_accion', async () => {
    const al = await sesionDe('alumno');
    const pc = await personaACargo(al.alumnoId!, 'T06 Hija');
    const asC = `${PROFESOR_NOMBRE} te reservó una clase`;
    const asM = `${PROFESOR_NOMBRE} cambió el horario de tu clase`;
    const asX = `${PROFESOR_NOMBRE} canceló tu clase`;
    const antesC = await mailsA(al.mail!, asC);
    const c = await crear('profesor', { p_alumno_id: al.alumnoId, p_persona_a_cargo_id: pc, p_inicio: slot('2026-11-09', '10:00'), p_tipo: 'serie', p_frecuencia: 1, p_observacion: 'Serie de prueba' });
    registrar('CA-27_serie_crear', { inicio: slot('2026-11-09', '10:00'), frecuencia: 1 }, { status: c.status, cuerpo: c.cuerpo });
    expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
    expect((c.cuerpo as { fechas: string[] }).fechas.length).toBeGreaterThanOrEqual(8);
    const mc = await esperarNuevo(al.mail!, asC, antesC);
    expect(mc.Text).toContain('T06 Hija');
    expect(mc.Text).toContain('semanal');

    const antesM = await mailsA(al.mail!, asM);
    const origen = await claseDe(al.alumnoId!, slot('2026-11-16', '10:00'));
    const m = await mover('profesor', origen, slot('2026-11-17', '11:00'), 'solo_esta');
    registrar('CA-27_serie_mover', { clase: origen, destino: slot('2026-11-17', '11:00'), alcance: 'solo_esta' }, { status: m.status, cuerpo: m.cuerpo });
    expect(m.status, JSON.stringify(m.cuerpo)).toBe(200);
    const e = await estados(al.alumnoId!);
    expect([e['11-09 10:00'], e['11-16 10:00'], e['11-17 11:00'], e['11-23 10:00']]).toEqual(['confirmada', 'movida', 'confirmada', 'confirmada']);
    expect((await agenda('profesor', '2026-11-17')).find((f) => f.clase_id)).toMatchObject({ quien_toma: 'T06 Hija', clase_estado: 'confirmada' });
    await esperarNuevo(al.mail!, asM, antesM);

    const antesX = await mailsA(al.mail!, asX);
    const desde = await claseDe(al.alumnoId!, slot('2026-11-23', '10:00'));
    const x = await cancelar('profesor', desde, 'desde_aca');
    registrar('CA-27_serie_cancelar', { clase: desde, alcance: 'desde_aca' }, { status: x.status, cuerpo: x.cuerpo });
    expect(x.status, JSON.stringify(x.cuerpo)).toBe(200);
    expect((x.cuerpo as { canceladas: number }).canceladas).toBeGreaterThan(0);
    const f = await estados(al.alumnoId!);
    expect([f['11-09 10:00'], f['11-17 11:00'], f['11-23 10:00'], f['11-30 10:00']]).toEqual(['confirmada', 'confirmada', 'cancelada', 'cancelada']);
    expect((await sql<{ hasta: string }>(`select hasta::text from public.reserva where alumno_id = $1 and tipo = 'serie'`, [al.alumnoId]))[0].hasta).toBe('2026-11-22');
    await esperarNuevo(al.mail!, asX, antesX);
    expect(await mailsA(al.mail!, asX)).toBe(antesX + 1);
  }, 90_000);

  it('PRF-03_mover_o_cancelar_con_un_pedido_pendiente_del_alumno_da_409_SOLICITUD_EN_CURSO_y_no_cambia_nada', async () => {
    const al = await sesionDe('alumno');
    const c = await crear('profesor', { p_alumno_id: al.alumnoId, p_inicio: slot('2026-11-09', '14:00'), p_tipo: 'serie', p_frecuencia: 1 });
    expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
    const futura = await claseDe(al.alumnoId!, slot('2026-11-16', '14:00'));
    const p = await rpc('alumno', 'solicitar_cancelacion', { p_clase_id: futura, p_alcance: 'solo_esta' });
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    const primera = await claseDe(al.alumnoId!, slot('2026-11-09', '14:00'));
    const casos = {
      cancelarLaMisma: await cancelar('profesor', futura, 'solo_esta'),
      moverLaMisma: await mover('profesor', futura, slot('2026-11-18', '14:00'), 'solo_esta'),
      cancelarDesdeLaPrimera: await cancelar('profesor', primera, 'desde_aca'),
    };
    registrar('PRF-03_SOLICITUD_EN_CURSO', { clase: futura }, Object.fromEntries(Object.entries(casos).map(([k, v]) => [k, [v.status, v.cuerpo]])));
    for (const r of Object.values(casos)) {
      expect([r.status, mensaje(r)]).toEqual([409, 'SOLICITUD_EN_CURSO']);
      expect(detalle(r)).toMatchObject({ solicitud_id: expect.any(String) });
    }
    const e = await estados(al.alumnoId!);
    expect(Object.values(e).filter((s) => s === 'cancelada' || s === 'movida')).toEqual([]);
  });
});

describe('CA-52 / SEC-06 / PRF-07 solo para sus personas y solo el profesor', () => {
  it('CA-52_crear_para_una_persona_sin_vinculo_pendiente_o_inexistente_da_403_y_B_no_toca_lo_de_A', async () => {
    const sc = await cargar('De A');
    const inicio = slot('2026-11-04', '10:00');
    const casos = {
      soloDeB: await crear('profesor', { p_alumno_id: await alumnoDe('alumnoB'), p_inicio: inicio, p_tipo: 'suelta' }),
      pendiente: await crear('profesor', { p_alumno_id: await alumnoDe('pendiente'), p_inicio: inicio, p_tipo: 'suelta' }),
      inexistente: await crear('profesor', { p_alumno_id: DEAD, p_inicio: inicio, p_tipo: 'suelta' }),
      bConLoDeA: await crear('profesorB', { p_alumno_id: sc, p_inicio: inicio, p_tipo: 'suelta' }),
    };
    registrar('CA-52_crear_403', { inicio }, Object.fromEntries(Object.entries(casos).map(([k, v]) => [k, [v.status, v.cuerpo]])));
    for (const r of Object.values(casos)) expect([r.status, mensaje(r)]).toEqual([403, 'PROHIBIDO']);
    expect(new Set(Object.values(casos).map((r) => JSON.stringify(r.cuerpo))).size, 'la misma respuesta: no revela si existe').toBe(1);
    expect((await sql(`select 1 from public.clase where inicio = $1::timestamptz and estado in ('confirmada', 'pendiente')`, [inicio])).length).toBe(0);
  });

  it('CA-52_B_no_mueve_ni_cancela_una_clase_de_A_(404)_y_la_persona_a_cargo_de_otro_titular_da_404', async () => {
    const al = await sesionDe('alumno');
    const c = await crear('profesor', { p_alumno_id: al.alumnoId, p_inicio: slot('2026-11-04', '10:00'), p_tipo: 'suelta' });
    expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
    const id = await claseDe(al.alumnoId!, slot('2026-11-04', '10:00'));
    const bm = await mover('profesorB', id, '2026-11-05T10:00:00+01:00', 'solo_esta');
    const bc = await cancelar('profesorB', id, 'solo_esta');
    const inexistente = await cancelar('profesorB', DEAD, 'solo_esta');
    expect([bm.status, bc.status, bc.cuerpo]).toEqual([404, 404, inexistente.cuerpo]);
    expect(await estados(al.alumnoId!)).toEqual({ '11-04 10:00': 'confirmada' });
    const ajena = await personaACargo(await alumnoDe('alumnoB'), 'T06 Ajena');
    const r = await crear('profesor', { p_alumno_id: al.alumnoId, p_persona_a_cargo_id: ajena, p_inicio: slot('2026-11-05', '10:00'), p_tipo: 'suelta' });
    expect([r.status, mensaje(r)]).toEqual([404, 'NO_ENCONTRADO']);
  });

  it('SEC-06_la_persona_el_Administrador_y_anon_no_ejecutan_las_cinco_RPC_y_nada_cambia', async () => {
    const al = await sesionDe('alumno');
    const args = { p_alumno_id: al.alumnoId, p_inicio: slot('2026-11-04', '10:00'), p_tipo: 'suelta' };
    for (const rol of ['alumno', 'pendiente', 'administrador'] as Rol[]) {
      expect((await crear(rol, args)).status, `crear como ${rol}`).toBe(403);
      expect((await mover(rol, DEAD, slot('2026-11-05', '10:00'), 'solo_esta')).status, `mover como ${rol}`).toBe(403);
      expect((await cancelar(rol, DEAD, 'solo_esta')).status, `cancelar como ${rol}`).toBe(403);
      expect((await rpc(rol, 'agenda_profesor', { p_dia: '2026-11-04' })).status, `agenda como ${rol}`).toBe(403);
      expect((await rpc(rol, 'contadores')).status, `contadores como ${rol}`).toBe(403);
    }
    expect([401, 403]).toContain((await crear('anon', args)).status);
    expect(await estados(al.alumnoId!)).toEqual({});
  });
});

describe('CA-28 / CA-52 / SEC-09 agenda del profesor', () => {
  it('CA-28_CA-52_el_hueco_ocupado_dice_quien_toma_el_titular_y_la_observacion_y_B_no_ve_nada_de_A', async () => {
    const al = await sesionDe('alumno');
    const pc = await personaACargo(al.alumnoId!, 'T06 Hijo');
    const c = await crear('profesor', { p_alumno_id: al.alumnoId, p_persona_a_cargo_id: pc, p_inicio: slot('2026-11-04', '09:00'), p_tipo: 'suelta', p_observacion: 'Llevar partitura' });
    expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
    const a = await agenda('profesor', '2026-11-04');
    const b = await agenda('profesorB', '2026-11-04');
    registrar('CA-28_CA-52', { dia: '2026-11-04' }, { A: a.filter((f) => f.clase_id), B: b.filter((f) => f.clase_id || f.titular) });
    expect(a.find((f) => f.clase_id)).toMatchObject({ estado: 'ocupado', quien_toma: 'T06 Hijo', observacion: 'Llevar partitura', clase_estado: 'confirmada' });
    expect(a.find((f) => f.clase_id)!.titular).toBeTruthy();
    expect(b.filter((f) => f.clase_id || f.titular || f.quien_toma || f.observacion)).toEqual([]);
    expect(JSON.stringify(b)).not.toContain('Llevar partitura');
  });

  it('SEC-09_p_dia_fuera_de_hoy_mas_menos_366_o_nulo_da_422_con_el_campo_y_los_limites_pasan', async () => {
    for (const dia of ['2027-11-03', '2025-11-01']) expect((await rpc('profesor', 'agenda_profesor', { p_dia: dia })).status, dia).toBe(200);
    for (const dia of ['2027-11-04', '2025-10-31', null]) {
      const r = await rpc('profesor', 'agenda_profesor', { p_dia: dia });
      registrar('SEC-09_p_dia', { p_dia: dia }, { status: r.status, cuerpo: r.cuerpo });
      expect([r.status, mensaje(r), detalle(r)], String(dia)).toEqual([422, 'DATOS_INVALIDOS', { campo: 'p_dia' }]);
    }
  });

  it('SEC-09_crear_y_mover_con_un_horario_pasado_o_a_mas_de_366_dias_dan_422_con_el_campo', async () => {
    const sc = await cargar('Limites');
    const casos: [string, string][] = [
      ['pasado', slot('2026-11-02', '08:00')],
      ['lejano', slot('2028-01-03', '10:00')],
    ];
    for (const [nombre, inicio] of casos) {
      const r = await crear('profesor', { p_alumno_id: sc, p_inicio: inicio, p_tipo: 'suelta' });
      registrar(`SEC-09_crear_${nombre}`, { inicio }, { status: r.status, cuerpo: r.cuerpo });
      expect([r.status, mensaje(r), detalle(r)], nombre).toEqual([422, 'DATOS_INVALIDOS', { campo: 'p_inicio' }]);
    }
    expect((await crear('profesor', { p_alumno_id: sc, p_inicio: slot('2026-11-04', '10:00'), p_tipo: 'suelta' })).status).toBe(200);
    const id = await claseDe(sc, slot('2026-11-04', '10:00'));
    for (const [nombre, destino] of casos) {
      const r = await mover('profesor', id, destino, 'solo_esta');
      registrar(`SEC-09_mover_${nombre}`, { destino }, { status: r.status, cuerpo: r.cuerpo });
      expect([r.status, mensaje(r), detalle(r)], nombre).toEqual([422, 'DATOS_INVALIDOS', { campo: 'p_destino' }]);
    }
    expect(await estados(sc)).toEqual({ '11-04 10:00': 'confirmada' });
  });
});

describe('CA-21 / CA-55 contador del panel con dos profesores (T-SOL-02)', () => {
  it('CA-21_CA-55_T-SOL-02_cada_profesor_cuenta_solo_lo_suyo_y_las_vencidas_no_cuentan', async () => {
    const cuentas = async (p: string) =>
      Number((await sql<{ n: string }>(`select count(*) n from public.inscripcion i join public.alumno a on a.id = i.alumno_id where i.profesor_id = $1 and i.estado = 'pendiente' and a.estado <> 'borrado'`, [p]))[0].n);
    const a0 = await contadores('profesor');
    const b0 = await contadores('profesorB');
    expect(a0.cuentas_pendientes).toBe(await cuentas(ids.PA));
    expect(b0.cuentas_pendientes).toBe(await cuentas(ids.PB));
    expect(a0.solicitudes_pendientes).toBe(0);
    const pa = await pedirReserva('alumno', ids.PA, slot('2026-11-05', '10:00'));
    const pb = await pedirReserva('alumnoB', ids.PB, slot('2026-11-10', '10:00'));
    expect([pa.status, pb.status], JSON.stringify([pa.cuerpo, pb.cuerpo])).toEqual([200, 200]);
    const a1 = await contadores('profesor');
    const b1 = await contadores('profesorB');
    registrar('CA-21_CA-55', { A: 'solicitud 05/11', B: 'solicitud 10/11' }, { antes: [a0, b0], despues: [a1, b1] });
    expect(a1).toEqual({ ...a0, solicitudes_pendientes: 1 });
    expect(b1).toEqual({ ...b0, solicitudes_pendientes: 1 });
    await fijarReloj('2026-11-05T13:01:00Z');
    expect((await contadores('profesor')).solicitudes_pendientes, 'la vencida de A ya no cuenta').toBe(0);
    expect((await contadores('profesorB')).solicitudes_pendientes, 'la de B sigue').toBe(1);
    expect((await leer<{ vencida: boolean }>('profesor', 'v_solicitudes_pendientes')).map((s) => s.vencida)).toEqual([true]);
  });
});

describe('CA-27 / DEC-32 ficha de la persona sin cuenta', () => {
  it('CA-27_DEC-32_el_profesor_edita_la_ficha_de_la_persona_sin_cuenta_que_cargo_y_la_de_una_persona_con_cuenta_se_rechaza', async () => {
    const sc = await cargar('Ficha');
    const ok = await rpc('profesor', 'editar_alumno', { p_alumno_id: sc, p_nombre: `${PREFIJO_NOMBRE}Ficha editada`, p_telefono: '+598 96 000 444', p_fecha_nacimiento: '1990-01-02', p_mail: null });
    registrar('CA-27_editar_sin_cuenta', { alumno: sc }, { status: ok.status, cuerpo: ok.cuerpo });
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    expect((await sql<{ nombre: string }>('select nombre from public.alumno where id = $1', [sc]))[0].nombre).toBe(`${PREFIJO_NOMBRE}Ficha editada`);
    const con = await alumnoDe('alumno');
    const antes = await sql('select nombre, telefono, fecha_nacimiento from public.alumno where id = $1', [con]);
    const no = await rpc('profesor', 'editar_alumno', { p_alumno_id: con, p_nombre: 'Nombre cambiado', p_telefono: '+598 96 000 555', p_fecha_nacimiento: '1980-01-01', p_mail: null });
    registrar('CA-27_editar_con_cuenta', { alumno: con }, { status: no.status, cuerpo: no.cuerpo });
    expect([no.status, mensaje(no)]).toEqual([403, 'PROHIBIDO']);
    expect(await sql('select nombre, telefono, fecha_nacimiento from public.alumno where id = $1', [con])).toEqual(antes);
  });
});

describe('CA-63 profesor inactivo del lado del profesor (PRF-08)', () => {
  it('CA-63_PRF-08_inactivo_crear_y_mover_dan_409_PROFESOR_INACTIVO_y_cancelar_agenda_y_contadores_funcionan', async () => {
    const sc = await cargar('Inactivo');
    expect((await crear('profesor', { p_alumno_id: sc, p_inicio: slot('2026-11-04', '10:00'), p_tipo: 'suelta' })).status).toBe(200);
    expect((await crear('profesor', { p_alumno_id: sc, p_inicio: slot('2026-11-04', '11:00'), p_tipo: 'suelta' })).status).toBe(200);
    const a = await claseDe(sc, slot('2026-11-04', '10:00'));
    const b = await claseDe(sc, slot('2026-11-04', '11:00'));
    await sql('update public.profesor set activo = false where slug = $1', [SLUG_A]);
    const c = await crear('profesor', { p_alumno_id: sc, p_inicio: slot('2026-11-05', '10:00'), p_tipo: 'suelta' });
    const m = await mover('profesor', a, slot('2026-11-05', '12:00'), 'solo_esta');
    const x = await cancelar('profesor', b, 'solo_esta');
    registrar('CA-63_inactivo', { activo: false }, { crear: [c.status, c.cuerpo], mover: [m.status, m.cuerpo], cancelar: [x.status, x.cuerpo] });
    expect([c.status, mensaje(c)]).toEqual([409, 'PROFESOR_INACTIVO']);
    expect([m.status, mensaje(m)]).toEqual([409, 'PROFESOR_INACTIVO']);
    expect(x.status, JSON.stringify(x.cuerpo)).toBe(200);
    expect(await estados(sc)).toEqual({ '11-04 10:00': 'confirmada', '11-04 11:00': 'cancelada' });
    expect((await rpc('profesor', 'agenda_profesor', { p_dia: '2026-11-04' })).status).toBe(200);
    expect((await rpc('profesor', 'contadores')).status).toBe(200);
  });
});

// T09.3 segunda parte. B10 (bloqueos) aún no está: la fila de `bloqueo` se siembra directo en la base con el rol de servicio (conexión de
// pruebas), con motivo «T09 …» para limpiarla. Cubre T-PRF-04 (mover «de acá en adelante» por API) y T-PRF-06 (rama bloqueo).
const bloquear = async (desde: string, hasta: string) =>
  sql(`insert into public.bloqueo (profesor_id, periodo, motivo) values ($1, tstzrange($2::timestamptz, $3::timestamptz), 'T09 bloqueo de prueba')`, [ids.PA, desde, hasta]);
const desbloquear = () => sql(`delete from public.bloqueo where motivo like 'T09 %'`);

describe('PRF-03 / T-PRF-04 mover «de acá en adelante» por la API', () => {
  it('PRF-03_T-PRF-04_mover_desde_aca_corta_la_serie_y_crea_otra_en_el_destino_salteando_la_fecha_bloqueada', async () => {
    const al = await sesionDe('alumno');
    const asM = `${PROFESOR_NOMBRE} cambió el horario de tu clase`; // mismo asunto para una clase y una serie; el texto dice «serie»
    try {
      const c = await crear('profesor', { p_alumno_id: al.alumnoId, p_inicio: slot('2026-11-09', '10:00'), p_tipo: 'serie', p_frecuencia: 1 });
      expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
      await bloquear(slot('2026-11-25', '11:00'), slot('2026-11-25', '12:00'));
      const antes = await mailsA(al.mail!, asM);
      const origen = await claseDe(al.alumnoId!, slot('2026-11-16', '10:00'));
      const entrada = { clase: origen, destino: slot('2026-11-18', '11:00'), alcance: 'desde_aca' };
      const m = await mover('profesor', origen, entrada.destino, 'desde_aca');
      registrar('T-PRF-04_mover_desde_aca', entrada, { status: m.status, cuerpo: m.cuerpo });
      expect(m.status, JSON.stringify(m.cuerpo)).toBe(200);
      expect((m.cuerpo as { salteadas: string[] }).salteadas.length).toBe(1);
      const e = await estados(al.alumnoId!);
      expect([e['11-09 10:00'], e['11-16 10:00'], e['11-23 10:00'], e['11-18 11:00'], e['11-25 11:00'], e['12-02 11:00']]).toEqual([
        'confirmada', 'movida', 'movida', 'confirmada', undefined, 'confirmada',
      ]);
      expect((await sql<{ hasta: string }>(`select hasta::text from public.reserva where alumno_id = $1 and tipo = 'serie' and origen = 'profesor' and reserva_origen_id is null`, [al.alumnoId]))[0].hasta).toBe('2026-11-15');
      expect((await esperarNuevo(al.mail!, asM, antes)).Text).toContain('serie');
    } finally {
      await desbloquear();
    }
  }, 90_000);
});

describe('PRF-06 / T-PRF-06 horario bloqueado en crear y mover', () => {
  it('PRF-06_T-PRF-06_crear_y_mover_a_un_horario_bloqueado_dan_409_HUECO_NO_LIBRE_y_no_cambian_nada', async () => {
    const sc = await cargar('Bloqueo');
    try {
      expect((await crear('profesor', { p_alumno_id: sc, p_inicio: slot('2026-11-04', '11:00'), p_tipo: 'suelta' })).status).toBe(200);
      const origen = await claseDe(sc, slot('2026-11-04', '11:00'));
      await bloquear(slot('2026-11-04', '10:00'), slot('2026-11-04', '11:00'));
      const c = await crear('profesor', { p_alumno_id: sc, p_inicio: slot('2026-11-04', '10:00'), p_tipo: 'suelta' });
      const m = await mover('profesor', origen, slot('2026-11-04', '10:00'), 'solo_esta');
      registrar('T-PRF-06_bloqueado', { inicio: slot('2026-11-04', '10:00') }, { crear: [c.status, c.cuerpo], mover: [m.status, m.cuerpo] });
      expect([c.status, mensaje(c)]).toEqual([409, 'HUECO_NO_LIBRE']);
      expect([m.status, mensaje(m)]).toEqual([409, 'HUECO_NO_LIBRE']);
      expect(await estados(sc)).toEqual({ '11-04 11:00': 'confirmada' });
      const fila = (await agenda('profesor', '2026-11-04')).find((f) => f.estado === 'bloqueado');
      expect(fila, 'la agenda muestra el hueco como bloqueado').toBeDefined();
    } finally {
      await desbloquear();
    }
  });
});
