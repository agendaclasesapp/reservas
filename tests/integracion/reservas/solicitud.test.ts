// B06 · T06.3 · solicitar_reserva y previsualizar_serie con dos profesores por la API real (PostgREST local, como la usa la web).
// Casos del plan: T-AGE-06, T-AGE-08, T-ALU-14 (parte de API), T-RES-08, T-SOL-01 (sin la parte del profesor, que cierra en B07 y B09),
// T-AVI-01 (rama solicitud), T-AVI-03. CA: CA-03, CA-05, CA-13, CA-19, CA-21, CA-26, CA-30, CA-51, CA-52, CA-54, CA-55, CA-63.
// IDs: RES-01, RES-02, RES-05, RES-07, SOL-09, AGE-04, AGE-11, AVI-02, SEC-06, SEC-09. La cuenta nueva de CA-30 la cubre B05
// (tests/integracion/cuentas/ficha-y-mails.test.ts, AVI-02). Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo.
// Datos sintéticos de las sesiones compartidas (tests/soporte/usuarios.ts); lo que crean se limpia al terminar.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { entorno } from '../../soporte/entorno';
import { rest, rpc, sesionDe, SLUG_A, SLUG_B, MAIL_PROFESOR, MAIL_PROFESOR_B, type Rol } from '../../soporte/usuarios';
import { detalle, filasDe, idsProfesores, limpiarB06, mensaje, prepararB06, registrar, slot, terminarB06, AHORA, type Ids } from './ayuda';

let ids: Ids;
const alumnoDe = async (rol: Rol) => (await sesionDe(rol)).alumnoId!;

beforeAll(async () => {
  for (const r of ['alumno', 'alumnoB', 'dosVinculos', 'pendiente', 'rechazado', 'ficha_incompleta', 'profesor', 'profesorB', 'administrador'] as Rol[]) await sesionDe(r);
  ids = await idsProfesores();
  await prepararB06();
}, 300_000);
afterEach(limpiarB06);
afterAll(async () => {
  await terminarB06();
  await cerrar();
});

type Extra = Record<string, unknown>;
const pedir = (rol: Rol, profesor: string, inicio: string, extra: Extra = {}) =>
  rpc(rol, 'solicitar_reserva', { p_profesor_id: profesor, p_inicio: inicio, p_tipo: 'suelta', ...extra });

const hora = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
async function estadoHueco(slug: string, dia: string, h: string): Promise<string | undefined> {
  const r = await rpc('anon', 'agenda_publica', { p_slug: slug, p_dia: dia });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return (r.cuerpo as { inicio: string; estado: string }[]).find((x) => hora(x.inicio) === h)?.estado;
}
async function mailsDe(para: string, asunto: string): Promise<number> {
  const q = encodeURIComponent(`to:"${para}" subject:"${asunto}"`);
  return ((await (await fetch(`${entorno().mailpitUrl}/api/v1/search?query=${q}`)).json()) as { messages: unknown[] }).messages.length;
}
async function esperarMails(para: string, asunto: string, n: number): Promise<number> {
  let total = 0;
  for (let i = 0; i < 120; i++) {
    total = await mailsDe(para, asunto);
    if (total >= n) return total;
    await new Promise((res) => setTimeout(res, 250));
  }
  return total;
}

describe('CA-13 anticipación mínima de 24 horas (AGE-04), reloj fijo', () => {
  it('CA-13_T-AGE-06_un_hueco_a_20_horas_se_rechaza_con_el_motivo_y_no_crea_nada', async () => {
    const a = await alumnoDe('alumno');
    const entrada = { p_profesor_id: ids.PA, p_inicio: slot('2026-11-03', '08:00'), p_tipo: 'suelta' };
    const r = await rpc('alumno', 'solicitar_reserva', entrada);
    registrar('CA-13_T-AGE-06', entrada, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(422);
    expect(mensaje(r)).toBe('ANTICIPACION_INSUFICIENTE');
    expect(detalle(r).horas_minimas).toBe(24);
    expect(await filasDe(a)).toBe('0/0/0');
  });
  it('CA-13_T-AGE-08_un_hueco_a_exactamente_24_horas_se_acepta', async () => {
    const a = await alumnoDe('alumno');
    const entrada = { p_profesor_id: ids.PA, p_inicio: slot('2026-11-03', '12:00'), p_tipo: 'suelta' };
    const r = await rpc('alumno', 'solicitar_reserva', entrada);
    registrar('CA-13_T-AGE-08', entrada, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(await filasDe(a)).toBe('1/1/1');
  });
  it('CA-13_a_23_horas_se_rechaza', async () => {
    const r = await pedir('alumno', ids.PA, slot('2026-11-03', '11:00'));
    expect(r.status).toBe(422);
    expect(mensaje(r)).toBe('ANTICIPACION_INSUFICIENTE');
  });
});

describe('CA-03 / CA-51 / CA-52 el vínculo es con el profesor de la agenda', () => {
  it('CA-03_pendiente_o_rechazado_con_el_profesor_de_la_agenda_recibe_403_CUENTA_NO_APROBADA_y_no_se_crea_nada', async () => {
    for (const [rol, estado] of [
      ['pendiente', 'pendiente'],
      ['rechazado', 'rechazado'],
    ] as [Rol, string][]) {
      const a = await alumnoDe(rol);
      const entrada = { p_profesor_id: ids.PA, p_inicio: slot('2026-11-04', '10:00') };
      const r = await pedir(rol, ids.PA, entrada.p_inicio);
      registrar(`CA-03_${rol}`, entrada, { status: r.status, cuerpo: r.cuerpo });
      expect(r.status, rol).toBe(403);
      expect(mensaje(r)).toBe('CUENTA_NO_APROBADA');
      expect(detalle(r)).toEqual({ estado, profesor_id: ids.PA });
      expect(await filasDe(a)).toBe('0/0/0');
    }
  });
  it('CA-03_aprobado_con_A_pero_pendiente_con_B_no_puede_pedir_a_B', async () => {
    const a = await alumnoDe('dosVinculos');
    const r = await pedir('dosVinculos', ids.PB, slot('2026-11-04', '10:00'));
    expect(r.status).toBe(403);
    expect(mensaje(r)).toBe('CUENTA_NO_APROBADA');
    expect(detalle(r)).toEqual({ estado: 'pendiente', profesor_id: ids.PB });
    expect(await filasDe(a)).toBe('0/0/0');
    expect((await pedir('dosVinculos', ids.PA, slot('2026-11-04', '10:00'))).status).toBe(200);
  });
  it('CA-51_B_rechaza_con_motivo_y_la_solicitud_dirigida_a_B_se_rechaza_mientras_la_de_A_sigue_aceptandose', async () => {
    const a = await alumnoDe('dosVinculos');
    await sql(`update public.inscripcion set estado = 'rechazado', motivo_estado = 'Sin cupo' where alumno_id = $1 and profesor_id = $2`, [a, ids.PB]);
    try {
      const rb = await pedir('dosVinculos', ids.PB, slot('2026-11-04', '11:00'));
      expect(rb.status).toBe(403);
      expect(detalle(rb)).toEqual({ estado: 'rechazado', profesor_id: ids.PB });
      const ra = await pedir('dosVinculos', ids.PA, slot('2026-11-04', '11:00'));
      expect(ra.status, JSON.stringify(ra.cuerpo)).toBe(200);
      registrar('CA-51', { rechazo: 'B', hueco: slot('2026-11-04', '11:00') }, { B: rb.status, A: ra.status });
    } finally {
      await sql(`update public.inscripcion set estado = 'pendiente', motivo_estado = null where alumno_id = $1 and profesor_id = $2`, [a, ids.PB]);
    }
  });
  it('CA-52_un_alumno_solo_de_A_que_pide_en_la_agenda_de_B_recibe_403_con_estado_nulo_y_no_se_crea_nada_y_viceversa', async () => {
    const aA = await alumnoDe('alumno');
    const aB = await alumnoDe('alumnoB');
    const r1 = await pedir('alumno', ids.PB, slot('2026-11-04', '12:00'));
    const r2 = await pedir('alumnoB', ids.PA, slot('2026-11-04', '12:00'));
    registrar('CA-52_rama_alumno', { hueco: slot('2026-11-04', '12:00') }, { alumno_en_B: r1.cuerpo, alumnoB_en_A: r2.cuerpo });
    for (const [r, p] of [
      [r1, ids.PB],
      [r2, ids.PA],
    ] as const) {
      expect(r.status).toBe(403);
      expect(mensaje(r)).toBe('CUENTA_NO_APROBADA');
      expect(detalle(r)).toEqual({ estado: null, profesor_id: p });
    }
    expect([await filasDe(aA), await filasDe(aB)]).toEqual(['0/0/0', '0/0/0']);
    expect(await estadoHueco(SLUG_A, '2026-11-04', '12:00')).toBe('libre');
    expect(await estadoHueco(SLUG_B, '2026-11-04', '12:00')).toBe('libre');
  });
  it('CA-52_un_profesor_el_Administrador_y_una_ficha_incompleta_no_piden_reservas', async () => {
    const hueco = slot('2026-11-04', '12:00');
    expect((await pedir('profesor', ids.PA, hueco)).status).toBe(403);
    expect((await pedir('profesorB', ids.PB, hueco)).status).toBe(403);
    expect((await pedir('administrador', ids.PA, hueco)).status).toBe(403);
    const f = await pedir('ficha_incompleta', ids.PA, hueco);
    expect(f.status).toBe(403);
    expect(mensaje(f)).toBe('FICHA_INCOMPLETA');
    expect((await pedir('anon', ids.PA, hueco)).status).toBeGreaterThanOrEqual(401);
    expect(await estadoHueco(SLUG_A, '2026-11-04', '12:00')).toBe('libre');
  });
});

describe('CA-05 / CA-26 persona a cargo (T-ALU-14, T-RES-08, SOL-09)', () => {
  it('CA-05_T-ALU-14_T-RES-08_la_persona_a_cargo_agregada_se_elige_al_pedir_y_la_clase_queda_a_su_nombre_con_el_alumno_como_titular', async () => {
    const a = await alumnoDe('alumno');
    const alta = await rpc('alumno', 'guardar_persona_a_cargo', { p_id: null, p_nombre: 'T06 Hija de prueba', p_fecha_nacimiento: '2015-05-05' });
    expect(alta.status, JSON.stringify(alta.cuerpo)).toBe(200);
    const [pac] = await sql<{ id: string }>(`select id from public.persona_a_cargo where nombre = 'T06 Hija de prueba'`);
    const entrada = { p_persona_a_cargo_id: pac.id, p_observacion: 'Primera vez' };
    const r = await pedir('alumno', ids.PA, slot('2026-11-04', '09:00'), entrada);
    registrar('CA-05_T-RES-08', entrada, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const [c] = await sql<{ persona_a_cargo_id: string; alumno_id: string; observacion: string; profesor_id: string }>(
      `select c.persona_a_cargo_id, c.alumno_id, r.observacion, c.profesor_id
         from public.clase c join public.reserva r on r.id = c.reserva_id where c.alumno_id = $1`,
      [a],
    );
    expect(c).toEqual({ persona_a_cargo_id: pac.id, alumno_id: a, observacion: 'Primera vez', profesor_id: ids.PA });
  });
  it('CA-26_SOL-09_T-RES-08_la_persona_a_cargo_de_otro_alumno_se_rechaza_con_403_y_una_inexistente_con_404', async () => {
    const a = await alumnoDe('alumno');
    const ajena = await rpc('dosVinculos', 'guardar_persona_a_cargo', { p_id: null, p_nombre: 'T06 Ajena', p_fecha_nacimiento: '2015-05-05' });
    expect(ajena.status, JSON.stringify(ajena.cuerpo)).toBe(200);
    const [pac] = await sql<{ id: string }>(`select id from public.persona_a_cargo where nombre = 'T06 Ajena'`);
    const r = await pedir('alumno', ids.PA, slot('2026-11-04', '09:00'), { p_persona_a_cargo_id: pac.id });
    expect(r.status).toBe(403);
    expect(mensaje(r)).toBe('PROHIBIDO');
    const n = await pedir('alumno', ids.PA, slot('2026-11-04', '09:00'), { p_persona_a_cargo_id: '00000000-0000-0000-0000-00000000dead' });
    expect(n.status).toBe(404);
    expect(mensaje(n)).toBe('NO_ENCONTRADO');
    expect(await filasDe(a)).toBe('0/0/0');
    expect(await estadoHueco(SLUG_A, '2026-11-04', '09:00')).toBe('libre');
  });
  it('CA-26_SOL-09_otra_persona_no_lee_ni_escribe_las_solicitudes_de_alumno', async () => {
    const a = await alumnoDe('alumno');
    expect((await pedir('alumno', ids.PA, slot('2026-11-04', '09:00'))).status).toBe(200);
    const propia = await rest('alumno', 'GET', 'v_mis_solicitudes?select=id,estado');
    expect((propia.cuerpo as unknown[]).length).toBe(1);
    for (const rol of ['dosVinculos', 'alumnoB', 'pendiente'] as Rol[]) {
      const vista = await rest(rol, 'GET', 'v_mis_solicitudes?select=id');
      const tabla = await rest(rol, 'GET', `solicitud?select=id&alumno_id=eq.${a}`);
      expect([vista.status, vista.cuerpo, tabla.status, tabla.cuerpo], rol).toEqual([200, [], 200, []]);
    }
    for (const [metodo, ruta, cuerpo] of [
      ['PATCH', `solicitud?alumno_id=eq.${a}`, { estado: 'confirmada' }],
      ['DELETE', `solicitud?alumno_id=eq.${a}`, undefined],
      ['POST', 'solicitud', { profesor_id: ids.PA, alumno_id: a, tipo: 'reserva', fecha_clase: '2026-12-01T12:00:00Z' }],
    ] as const) {
      const r = await rest('alumno', metodo, ruta, cuerpo);
      expect([401, 403], `${metodo} ${ruta}`).toContain(r.status);
    }
    expect(await filasDe(a)).toBe('1/1/1');
  });
});

describe('CA-21 / T-SOL-01 la solicitud ocupa el hueco', () => {
  it('CA-21_T-SOL-01_pendiente_para_la_persona_ocupado_en_la_agenda_publica_de_ese_profesor_y_libre_en_la_del_otro', async () => {
    const hueco = slot('2026-11-04', '10:00');
    expect(await estadoHueco(SLUG_A, '2026-11-04', '10:00')).toBe('libre');
    const r = await pedir('alumno', ids.PA, hueco);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const res = r.cuerpo as { solicitud_id: string; reserva_id: string; fechas: string[]; salteadas: string[] };
    expect(res.fechas).toHaveLength(1);
    expect(res.salteadas).toEqual([]);
    const vista = await rest('alumno', 'GET', 'v_mis_solicitudes?select=id,profesor_id,tipo,estado,vencida,reserva_id');
    registrar('CA-21_T-SOL-01', { hueco }, { resultado: r.cuerpo, vista: vista.cuerpo });
    expect(vista.cuerpo).toEqual([
      { id: res.solicitud_id, profesor_id: ids.PA, tipo: 'reserva', estado: 'pendiente', vencida: false, reserva_id: res.reserva_id },
    ]);
    expect(await estadoHueco(SLUG_A, '2026-11-04', '10:00')).toBe('ocupado');
    // RES-07 / CA-54: el mismo horario sigue libre con B.
    expect(await estadoHueco(SLUG_B, '2026-11-04', '10:00')).toBe('libre');
    const deA = await rest('profesor', 'GET', `solicitud?select=id,estado&id=eq.${res.solicitud_id}`);
    const deB = await rest('profesorB', 'GET', `solicitud?select=id&id=eq.${res.solicitud_id}`);
    expect([deA.cuerpo, deB.cuerpo]).toEqual([[{ id: res.solicitud_id, estado: 'pendiente' }], []]);
    const [r1] = await sql<{ estado: string; origen: string; hasta: string; desde: string }>(
      `select estado, origen, hasta::text, desde::text from public.reserva where id = $1`,
      [res.reserva_id],
    );
    expect(r1).toEqual({ estado: 'pendiente', origen: 'solicitud', hasta: '2026-11-04', desde: '2026-11-04' });
  });
});

describe('CA-54 / RES-07 A y B son independientes', () => {
  it('CA-54_RES-07_el_mismo_horario_ocupado_con_A_se_acepta_con_B', async () => {
    const hueco = slot('2026-11-04', '10:00');
    expect((await pedir('alumno', ids.PA, hueco)).status).toBe(200);
    const mismo = await pedir('dosVinculos', ids.PA, hueco);
    expect(mismo.status).toBe(409);
    expect(mensaje(mismo)).toBe('HUECO_NO_LIBRE');
    const conB = await pedir('alumnoB', ids.PB, hueco);
    expect(conB.status, JSON.stringify(conB.cuerpo)).toBe(200);
    expect([await estadoHueco(SLUG_A, '2026-11-04', '10:00'), await estadoHueco(SLUG_B, '2026-11-04', '10:00')]).toEqual(['ocupado', 'ocupado']);
  });
  it('CA-54_la_anticipacion_y_un_bloqueo_de_A_no_cambian_lo_de_B', async () => {
    await sql('update public.profesor set anticipacion_horas = 48 where id = $1', [ids.PA]);
    await sql(`insert into public.bloqueo (profesor_id, periodo, motivo) values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), 'T06 Bloqueo de A')`, [
      ids.PA,
      slot('2026-11-05', '08:00'),
      slot('2026-11-05', '13:00'),
    ]);
    try {
      const a = await pedir('alumno', ids.PA, slot('2026-11-04', '11:00')); // +47 h: A pide 48 h
      expect(a.status).toBe(422);
      expect(detalle(a).horas_minimas).toBe(48);
      const b = await pedir('alumnoB', ids.PB, slot('2026-11-04', '11:00')); // B sigue en 24 h
      expect(b.status, JSON.stringify(b.cuerpo)).toBe(200);
      expect(await estadoHueco(SLUG_A, '2026-11-05', '09:00')).toBe('bloqueado');
      expect(await estadoHueco(SLUG_B, '2026-11-05', '09:00')).toBe('libre');
      const c = await pedir('alumnoB', ids.PB, slot('2026-11-05', '09:00'));
      expect(c.status, JSON.stringify(c.cuerpo)).toBe(200);
    } finally {
      await sql('update public.profesor set anticipacion_horas = 24 where id = $1', [ids.PA]);
    }
  });
});

describe('CA-30 / CA-55 / T-AVI-01 / T-AVI-03 mail de solicitud nueva al profesor de la solicitud', () => {
  it('CA-30_CA-55_T-AVI-01_cada_solicitud_manda_un_mail_solo_al_profesor_al_que_va_dirigida', async () => {
    const asuntoA = 'Solicitud de reserva nueva: Alumno dosVinculos';
    const asuntoB = 'Solicitud de reserva nueva: Alumno alumnoB';
    const antes = [
      await mailsDe(MAIL_PROFESOR, asuntoA),
      await mailsDe(MAIL_PROFESOR_B, asuntoB),
      await mailsDe(MAIL_PROFESOR, asuntoB),
      await mailsDe(MAIL_PROFESOR_B, asuntoA),
    ];
    expect((await pedir('dosVinculos', ids.PA, slot('2026-11-04', '10:00'), { p_observacion: 'Observacion secreta T06' })).status).toBe(200);
    expect((await pedir('alumnoB', ids.PB, slot('2026-11-04', '10:00'))).status).toBe(200);
    expect(await esperarMails(MAIL_PROFESOR, asuntoA, antes[0] + 1)).toBe(antes[0] + 1);
    expect(await esperarMails(MAIL_PROFESOR_B, asuntoB, antes[1] + 1)).toBe(antes[1] + 1);
    // CA-55: la solicitud hecha en A no llega a B, ni la de B a A.
    expect([await mailsDe(MAIL_PROFESOR, asuntoB), await mailsDe(MAIL_PROFESOR_B, asuntoA)]).toEqual([antes[2], antes[3]]);
    const filas = await sql<{ profesor_id: string; destinatario: string; asunto: string; cuerpo_texto: string }>(
      `select profesor_id, destinatario, asunto, cuerpo_texto from public.mail_salida where tipo = 'solicitud_nueva' order by destinatario`,
    );
    registrar(
      'CA-30_T-AVI-01',
      { solicitudes: ['A', 'B'] },
      filas.map((f) => ({ para: f.destinatario, asunto: f.asunto })),
    );
    expect(filas.map((f) => [f.profesor_id, f.destinatario, f.asunto])).toEqual([
      [ids.PA, MAIL_PROFESOR, asuntoA],
      [ids.PB, MAIL_PROFESOR_B, asuntoB],
    ]);
    expect(filas.every((f) => !f.cuerpo_texto.includes('Observacion secreta T06'))).toBe(true);
  });
  it('CA-30_T-AVI-03_una_solicitud_rechazada_por_la_RPC_no_encola_ni_envia_mail', async () => {
    expect((await pedir('alumno', ids.PA, slot('2026-11-04', '10:00'))).status).toBe(200);
    const [antes] = await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'solicitud_nueva'`);
    const asunto = 'Solicitud de reserva nueva: Alumno dosVinculos';
    const enviados = await mailsDe(MAIL_PROFESOR, asunto);
    const r = await pedir('dosVinculos', ids.PA, slot('2026-11-04', '10:00'));
    expect(r.status).toBe(409);
    expect(mensaje(r)).toBe('HUECO_NO_LIBRE');
    for (const fallo of [
      pedir('dosVinculos', ids.PA, slot('2026-11-03', '08:00')), // anticipación
      pedir('dosVinculos', ids.PA, slot('2026-11-04', '10:30')), // fuera de la grilla
      pedir('alumnoB', ids.PA, slot('2026-11-04', '11:00')), // sin vínculo
    ])
      expect((await fallo).status).toBeGreaterThanOrEqual(400);
    const [despues] = await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'solicitud_nueva'`);
    registrar('CA-30_T-AVI-03', { fallos: 4 }, { encoladosAntes: antes.n, encoladosDespues: despues.n });
    expect(despues.n).toBe(antes.n);
    await new Promise((res) => setTimeout(res, 1500));
    expect(await mailsDe(MAIL_PROFESOR, asunto)).toBe(enviados);
  });
});

describe('RES-05 / CA-19 serie con una fecha bloqueada o ocupada, y SEC-09', () => {
  const INICIO = slot('2026-11-06', '09:00');
  async function sembrar() {
    await sql(`insert into public.bloqueo (profesor_id, periodo, motivo) values ($1, tstzrange($2::timestamptz, $3::timestamptz, '[)'), 'T06 Bloqueo de A')`, [
      ids.PA,
      slot('2026-11-20', '08:00'),
      slot('2026-11-20', '13:00'),
    ]);
    // 04/12 09:00 ocupado por una clase confirmada de otra persona (dosVinculos, creada por el profesor).
    const aDos = await alumnoDe('dosVinculos');
    const [rv] = await sql<{ id: string }>(
      `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, hasta, origen)
       values ($1, $2, 'suelta', '09:00', 5, 60, 'confirmada', '2026-12-04', '2026-12-04', 'profesor') returning id`,
      [ids.PA, aDos],
    );
    await sql(`insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado) values ($1, $2, $3, $4::timestamptz, $5::timestamptz, 'confirmada')`, [
      ids.PA,
      rv.id,
      aDos,
      slot('2026-12-04', '09:00'),
      slot('2026-12-04', '10:00'),
    ]);
  }
  const clave = (iso: string) => new Date(iso).getTime();

  it('CA-19_RES-05_previsualizar_serie_marca_salteadas_la_bloqueada_y_la_ocupada_y_la_primera_va_reservable', async () => {
    await sembrar();
    const r = await rpc('alumno', 'previsualizar_serie', { p_profesor_id: ids.PA, p_inicio: INICIO, p_frecuencia: 1 });
    registrar('CA-19_previsualizar', { p_inicio: INICIO, p_frecuencia: 1 }, { status: r.status, filas: (r.cuerpo as unknown[])?.length });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const filas = r.cuerpo as { inicio: string; estado: string; motivo: string | null }[];
    const en = (iso: string) => filas.find((f) => clave(f.inicio) === clave(iso));
    expect(en(INICIO)).toMatchObject({ estado: 'reservable', motivo: null });
    expect(en(slot('2026-11-13', '09:00'))).toMatchObject({ estado: 'reservable', motivo: null });
    expect(en(slot('2026-11-20', '09:00'))).toMatchObject({ estado: 'salteada', motivo: 'bloqueado' });
    expect(en(slot('2026-12-04', '09:00'))).toMatchObject({ estado: 'salteada', motivo: 'ocupado' });
    expect(filas.filter((f) => f.estado === 'salteada')).toHaveLength(2);
  });
  it('CA-19_RES-02_la_quincenal_salta_una_semana_de_por_medio', async () => {
    await sembrar();
    const r = await rpc('alumno', 'previsualizar_serie', { p_profesor_id: ids.PA, p_inicio: INICIO, p_frecuencia: 2 });
    const f = (r.cuerpo as { inicio: string; estado: string }[]).slice(0, 4).map((x) => `${new Date(x.inicio).toISOString().slice(0, 10)} ${x.estado}`);
    expect(f).toEqual(['2026-11-06 reservable', '2026-11-20 salteada', '2026-12-04 salteada', '2026-12-18 reservable']);
  });
  it('CA-19_RES-05_la_serie_semanal_crea_las_clases_menos_las_salteadas_que_no_quedan_reservadas', async () => {
    await sembrar();
    const a = await alumnoDe('alumno');
    const r = await pedir('alumno', ids.PA, INICIO, { p_tipo: 'serie', p_frecuencia: 1, p_observacion: 'Serie T06' });
    registrar('CA-19_serie', { p_inicio: INICIO, p_tipo: 'serie', p_frecuencia: 1 }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const res = r.cuerpo as { solicitud_id: string; reserva_id: string; fechas: string[]; salteadas: string[] };
    expect(res.salteadas.map(clave)).toEqual([clave(slot('2026-11-20', '09:00')), clave(slot('2026-12-04', '09:00'))]);
    expect(res.fechas).toHaveLength(24);
    expect(res.fechas.map(clave)).not.toContain(clave(slot('2026-11-20', '09:00')));
    const [n] = await sql<{ n: number; pend: number; saltadas: number }>(
      `select count(*)::int as n, count(*) filter (where estado = 'pendiente')::int as pend,
              count(*) filter (where inicio in ($2::timestamptz, $3::timestamptz))::int as saltadas
         from public.clase where alumno_id = $1`,
      [a, slot('2026-11-20', '09:00'), slot('2026-12-04', '09:00')],
    );
    expect(n).toEqual({ n: 24, pend: 24, saltadas: 0 });
    const [s] = await sql<{ n: number }>(`select count(*)::int as n from public.solicitud where alumno_id = $1`, [a]);
    expect(s.n).toBe(1);
    const [rv] = await sql<{ tipo: string; frecuencia_semanas: number; hasta: string | null }>(
      `select tipo, frecuencia_semanas, hasta::text from public.reserva where id = $1`,
      [res.reserva_id],
    );
    expect(rv).toMatchObject({ tipo: 'serie', frecuencia_semanas: 1, hasta: null });
    expect(await estadoHueco(SLUG_A, '2026-11-13', '09:00')).toBe('ocupado');
    expect(await estadoHueco(SLUG_B, '2026-11-13', '09:00')).toBe('libre');
  });
  it('SEC-09_los_campos_invalidos_dan_422_con_el_campo_y_no_crean_nada', async () => {
    const a = await alumnoDe('alumno');
    const hueco = slot('2026-11-04', '10:00');
    const casos: [Extra, string][] = [
      [{ p_observacion: 'x'.repeat(501) }, 'p_observacion'],
      [{ p_tipo: 'otra' }, 'p_tipo'],
      [{ p_tipo: 'serie', p_frecuencia: 3 }, 'p_frecuencia'],
      [{ p_tipo: 'serie' }, 'p_frecuencia'],
    ];
    for (const [extra, campo] of casos) {
      const r = await pedir('alumno', ids.PA, hueco, extra);
      expect(r.status, campo).toBe(422);
      expect(mensaje(r)).toBe('DATOS_INVALIDOS');
      expect(detalle(r)).toEqual({ campo });
    }
    for (const inicio of [slot('2026-11-04', '10:30'), slot('2026-11-08', '10:00')]) {
      const r = await pedir('alumno', ids.PA, inicio);
      expect([r.status, mensaje(r)], inicio).toEqual([422, 'FUERA_DE_GRILLA']);
    }
    const prev = await rpc('alumno', 'previsualizar_serie', { p_profesor_id: ids.PA, p_inicio: hueco, p_frecuencia: 3 });
    expect([prev.status, detalle(prev)]).toEqual([422, { campo: 'p_frecuencia' }]);
    expect(await filasDe(a)).toBe('0/0/0');
    expect((await pedir('alumno', ids.PA, hueco, { p_observacion: 'x'.repeat(500) })).status).toBe(200);
  });
});

describe('CA-63 / AGE-11 profesor inactivo (DEC-35 A)', () => {
  it('CA-63_con_el_profesor_inactivo_solicitar_reserva_da_409_PROFESOR_INACTIVO_sin_crear_nada_y_lo_de_B_no_cambia', async () => {
    const a = await alumnoDe('alumno');
    await sql('update public.profesor set activo = false where id = $1', [ids.PA]);
    try {
      const r = await pedir('alumno', ids.PA, slot('2026-11-04', '10:00'));
      const p = await rpc('alumno', 'previsualizar_serie', { p_profesor_id: ids.PA, p_inicio: slot('2026-11-04', '10:00'), p_frecuencia: 1 });
      registrar('CA-63', { profesor: 'A inactivo' }, { solicitar: [r.status, mensaje(r)], previsualizar: [p.status, mensaje(p)] });
      expect([r.status, mensaje(r)]).toEqual([409, 'PROFESOR_INACTIVO']);
      expect([p.status, mensaje(p)]).toEqual([409, 'PROFESOR_INACTIVO']);
      expect(await filasDe(a)).toBe('0/0/0');
      const b = await pedir('alumnoB', ids.PB, slot('2026-11-04', '10:00'));
      expect(b.status, JSON.stringify(b.cuerpo)).toBe(200);
    } finally {
      await sql('update public.profesor set activo = true where id = $1', [ids.PA]);
    }
    expect((await pedir('alumno', ids.PA, slot('2026-11-04', '10:00'))).status).toBe(200);
  });
  it('CA-63_SEC-28_extender_series_no_materializa_las_series_del_profesor_inactivo_y_al_reactivarlo_las_completa', async () => {
    const aA = await alumnoDe('alumno');
    const aB = await alumnoDe('alumnoB');
    expect((await pedir('alumno', ids.PA, slot('2026-11-06', '09:00'), { p_tipo: 'serie', p_frecuencia: 1 })).status).toBe(200);
    expect((await pedir('alumnoB', ids.PB, slot('2026-11-06', '09:00'), { p_tipo: 'serie', p_frecuencia: 1 })).status).toBe(200);
    const clases = async (al: string) => (await sql<{ n: number }>('select count(*)::int as n from public.clase where alumno_id = $1', [al]))[0].n;
    const [antesA, antesB] = [await clases(aA), await clases(aB)];
    await sql('update public.profesor set activo = false where id = $1', [ids.PA]);
    try {
      const [creadas] = await sql<{ n: number }>(`select privado.extender_series('${AHORA}'::timestamptz + interval '14 days') as n`);
      registrar('CA-63_extender_series', { ahora: '+14 días', A: 'inactivo' }, { creadas: creadas.n, A: [antesA, await clases(aA)], B: [antesB, await clases(aB)] });
      expect(await clases(aA)).toBe(antesA);
      expect(await clases(aB)).toBe(antesB + 2);
      expect(creadas.n).toBe(2);
    } finally {
      await sql('update public.profesor set activo = true where id = $1', [ids.PA]);
    }
    await sql(`select privado.extender_series('${AHORA}'::timestamptz + interval '14 days')`);
    expect(await clases(aA)).toBe(antesA + 2);
    const [cron] = await sql<{ n: number }>(`select count(*)::int as n from cron.job where jobname = 'extender_series'`);
    expect(cron.n).toBe(1);
  });
});
