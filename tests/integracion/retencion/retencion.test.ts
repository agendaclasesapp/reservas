// B11 · T11.3 · Retención, aviso de inactividad y recordatorios corridos como los llama pg_cron (`call privado.correr_proceso(...)`, rol postgres),
// con el reloj de la aplicación fijo (ADR-014) y los mails verificados en Mailpit. Usuarios de Auth reales (ingreso por código): el barrido de
// centinelas (SEC-26, H-004) mira también sessions, refresh_tokens, identities y el audit log que deja un ingreso de verdad.
// CA: CA-08, CA-09, CA-31, CA-32, CA-45 (tras la retención), CA-59. IDs: ALU-10, ALU-11, AVI-05, AVI-06, AVI-07, SEC-26, SEC-27, SEC-28, DEC-26 A.
// Las dos corridas se confirman en la base compartida: las personas son propias y se borran al terminar; el reloj fijo (2026-11-02) deja fuera
// a las personas de las sesiones compartidas (su vencimiento está en 2027), y una prueba lo comprueba.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj } from '../../soporte/reloj';
import { MAIL_PROFESOR } from '../../soporte/usuarios';
import { AHORA, clase, correr, desde, DIA, esperarMailCon, HORA, idsProfesores, mailsA, misIds, persona, preparar, registrar, restos, terminar, type Ids, type Persona } from './ayuda';

const S = `zzc${Date.now()}`; // centinela único de la corrida
const TEL = `097 ${String(Math.floor(Math.random() * 900) + 100)} ${String(Math.floor(Math.random() * 900) + 100)}`;
const TEL_CLAVE = TEL.replace(/\D/g, '').slice(-8);
const NACIMIENTO = '1983-03-17';
const NACIMIENTO_PAC = '1991-12-19';

let ids: Ids;
let dos: Persona; // CA-59: con A hace 7 meses, con B hace 2
let sent: Persona; // CA-08/CA-45/SEC-26: vencida, rechazada por A con motivo
let ingresa: Persona; // CA-09: ingresó (hora simulada) tras 6 meses sin clases
let aviso: Persona; // CA-32: vence en 6 días
let lejana: Persona; // CA-32: vence en 8 días
let corrida: Awaited<ReturnType<typeof correr>>;

beforeAll(async () => {
  ids = await idsProfesores();
  await preparar();
  await fijarReloj(AHORA);
  dos = await persona('t11dos', 'T11 Dos Profes', ids, { cuenta: false, creado: '2026-01-01T12:00:00Z', con: { PA: 'aprobado', PB: 'aprobado' } });
  await clase(ids.PA, dos.id, '2026-04-02T15:00:00Z');
  await clase(ids.PB, dos.id, '2026-09-02T15:00:00Z');

  sent = await persona(`t11s${S}`, `Sent ${S}`, ids, {
    cuenta: true,
    creado: '2026-01-01T12:00:00Z',
    con: { PA: 'rechazado', PB: 'aprobado' },
    motivo: `motivo ${S}`,
    como: `como llegue ${S}`,
    telefono: TEL,
    nacimiento: NACIMIENTO,
  });
  const [pc] = await sql<{ id: string }>(`insert into public.persona_a_cargo (alumno_id, nombre, fecha_nacimiento) values ($1, $2, $3) returning id`, [sent.id, `Hija ${S}`, NACIMIENTO_PAC]);
  const claseSent = await clase(ids.PB, sent.id, '2026-04-20T15:00:00Z', { observacion: `obs ${S}` });
  await sql('update public.clase set persona_a_cargo_id = $2 where id = $1', [claseSent, pc.id]);
  await sql(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen)
     values ($1, $2, 'suelta', '10:00', 1, 60, $3, 'rechazada', '2026-03-02', 'solicitud')`,
    [ids.PA, sent.id, `otra obs ${S}`],
  );
  await sql(
    `insert into public.solicitud (profesor_id, alumno_id, tipo, reserva_id, fecha_clase, estado, motivo, respondida_en)
     select $1, $2, 'reserva', r.id, '2026-03-02T13:00:00Z', 'rechazada', $3, '2026-02-20T12:00:00Z' from public.reserva r where r.alumno_id = $2 and r.estado = 'rechazada'`,
    [ids.PA, sent.id, `solicitud ${S}`],
  );
  await sql(
    `insert into public.mail_salida (profesor_id, alumno_id, tipo, destinatario, asunto, cuerpo_texto, estado) values ($1, $2, 'clase_creada', $3, $4, $4, 'enviado')`,
    [ids.PA, sent.id, sent.mail, `mail ${S}`],
  );

  ingresa = await persona('t11ing', 'T11 Ingreso', ids, { cuenta: true, creado: '2026-01-01T12:00:00Z', con: { PA: 'aprobado' }, conservarIngreso: true });
  await clase(ids.PA, ingresa.id, '2026-05-01T15:00:00Z');

  aviso = await persona('t11avi', 'T11 Aviso', ids, { creado: '2026-01-01T12:00:00Z', con: { PA: 'aprobado' } });
  await clase(ids.PA, aviso.id, '2026-05-08T14:00:00Z');
  lejana = await persona('t11lej', 'T11 Lejana', ids, { creado: '2026-01-01T12:00:00Z', con: { PB: 'aprobado' } });
  await clase(ids.PB, lejana.id, '2026-05-10T14:00:00Z');

  corrida = await correr('retencion');
  registrar('B11_retencion', { reloj: AHORA, comando: "call privado.correr_proceso('retencion')" }, corrida);
}, 300_000);
afterAll(async () => {
  await terminar();
  await cerrar();
});

describe('CA-59 / DEC-26 A el plazo es de la persona, con todos sus profesores', () => {
  it('CA-59_con_A_hace_7_meses_y_con_B_hace_2_no_se_borra', async () => {
    const [f] = await sql<{ nombre: string; estado: string }>('select nombre, estado from public.alumno where id = $1', [dos.id]);
    const [v] = await sql<{ v: Date }>('select privado.vence_inactividad_en($1, public.app_ahora()) as v', [dos.id]);
    registrar('CA-59_dos_profesores', { clases: ['A 2026-04-02', 'B 2026-09-02'], reloj: AHORA }, { ...f, vence: v.v });
    expect(f).toEqual({ nombre: 'T11 Dos Profes', estado: 'completa' });
    expect(v.v.toISOString()).toBe('2027-03-02T16:00:00.000Z');
  });
});

describe('CA-08 / CA-45 / CA-09 retención con el reloj fijo', () => {
  it('CA-08_la_persona_vencida_queda_sin_datos_y_su_historial_sigue_contando', async () => {
    const [a] = await sql<Record<string, unknown>>('select nombre, mail, telefono, fecha_nacimiento::text as nac, user_id, estado, borrado_en from public.alumno where id = $1', [sent.id]);
    const clases = await sql<{ estado: string; persona_a_cargo_id: string | null }>('select estado, persona_a_cargo_id from public.clase where alumno_id = $1', [sent.id]);
    const pc = await sql('select 1 from public.persona_a_cargo where alumno_id = $1', [sent.id]);
    const usuario = await sql('select 1 from auth.users where id = $1', [sent.userId]);
    registrar('CA-08', { persona: sent.id }, { a, clases, personasACargo: pc.length, usuarioDeAuth: usuario.length });
    expect(a).toMatchObject({ nombre: null, mail: null, telefono: null, nac: null, user_id: null, estado: 'borrado' });
    expect((a.borrado_en as Date).toISOString()).toBe(AHORA.replace('Z', '.000Z'));
    expect(pc).toHaveLength(0);
    expect(usuario).toHaveLength(0);
    expect(clases).toEqual([{ estado: 'confirmada', persona_a_cargo_id: null }]);
  });
  it('CA-45_tras_la_retencion_de_una_persona_rechazada_con_motivo_no_queda_motivo', async () => {
    const f = await sql<{ estado: string; motivo_estado: string | null; como_llego: string | null }>('select estado, motivo_estado, como_llego from public.inscripcion where alumno_id = $1 order by estado', [sent.id]);
    registrar('CA-45_retencion', { rechazada_por: 'A', motivo: `motivo ${S}` }, f);
    expect(f).toEqual([
      { estado: 'baja', motivo_estado: null, como_llego: null },
      { estado: 'baja', motivo_estado: null, como_llego: null },
    ]);
  });
  it('SEC-26_barrido_de_centinelas_sin_restos_en_public_auth_ni_privado', async () => {
    const quedan = await restos([S, TEL, TEL_CLAVE, NACIMIENTO, NACIMIENTO_PAC].join('|'));
    registrar('SEC-26', { centinela: '<zzc…>', en: 'nombre, mail, teléfono, nacimiento, persona a cargo, motivo de rechazo, cómo llegó, solicitud.motivo, reserva.observacion, mail_salida, Auth' }, { restos: quedan });
    expect(quedan, 'tablas con restos de la persona borrada').toBe('');
  });
  it('CA-09_el_ingreso_con_la_hora_simulada_evita_el_borrado_aunque_su_ultima_clase_sea_de_hace_6_meses', async () => {
    const [f] = await sql<{ estado: string; ultimo_ingreso: Date }>('select estado, ultimo_ingreso from public.alumno where id = $1', [ingresa.id]);
    registrar('CA-09', { ultima_clase: '2026-05-01', ingreso: AHORA }, f);
    expect(f.estado).toBe('completa');
    expect(f.ultimo_ingreso.toISOString()).toBe(AHORA.replace('Z', '.000Z'));
  });
  it('SEC-27_la_retencion_no_toca_a_las_personas_de_las_sesiones_compartidas', async () => {
    const ajenas = await sql<{ id: string }>(`select id from public.alumno where estado = 'borrado' and borrado_en = $1::timestamptz and id <> all($2::uuid[])`, [AHORA, misIds()]);
    expect(ajenas).toEqual([]);
  });
});

describe('SEC-28 jobs y registro de cada corrida', () => {
  it('SEC-28_los_jobs_retencion_y_recordatorios_estan_registrados_en_cron_job', async () => {
    const jobs = await sql<{ jobname: string; schedule: string; username: string; active: boolean; command: string }>(
      `select jobname, schedule, username, active, command from cron.job where jobname in ('retencion', 'recordatorios') order by jobname`,
    );
    registrar('SEC-28_cron', {}, jobs);
    expect(jobs.map((j) => [j.jobname, j.schedule, j.username, j.active])).toEqual([
      ['recordatorios', '*/15 * * * *', 'postgres', true],
      ['retencion', '30 3 * * *', 'postgres', true],
    ]);
    for (const j of jobs) expect(j.command).toContain(j.jobname);
  });
  it('SEC-28_la_corrida_de_la_retencion_quedo_en_ejecucion_proceso_con_la_hora_simulada', async () => {
    expect(corrida.ok).toBe(true);
    expect(corrida.error).toBeNull();
    expect(corrida.ahora.toISOString()).toBe(AHORA.replace('Z', '.000Z'));
    expect(Number(corrida.cantidades?.anonimizados)).toBeGreaterThanOrEqual(1);
    expect(corrida.cantidades).toHaveProperty('avisos');
    const [f] = await sql<{ n: string }>(`select count(*)::text as n from privado.ejecucion_proceso where id = $1::bigint and fin >= inicio`, [corrida.id]);
    expect(f.n).toBe('1');
  });
});

describe('CA-32 / AVI-06 / AVI-07 aviso de inactividad 7 días antes', () => {
  it('CA-32_el_aviso_llega_con_el_nombre_del_servicio_sin_Reply-To_y_con_profesor_id_nulo', async () => {
    const asunto = 'Tus datos en Agenda Clases App se borran en 7 días';
    const m = await esperarMailCon(aviso.mail, asunto, 'vamos a borrar tus datos');
    const [fila] = await sql<{ profesor_id: string | null; remitente_nombre: string | null; responder_a: string | null; tipo: string }>(
      `select profesor_id, remitente_nombre, responder_a, tipo from public.mail_salida where alumno_id = $1 and tipo = 'aviso_inactividad'`,
      [aviso.id],
    );
    registrar('CA-32_aviso', { persona: aviso.mail, vence: 'AHORA + 6 días' }, { from: m.From, replyTo: m.ReplyTo, subject: m.Subject, fila, texto: m.Text });
    expect(m.From.Name).toBe('Agenda Clases App');
    expect(m.ReplyTo ?? []).toEqual([]);
    expect(m.Text).toContain('08/11/2026');
    expect(m.Text).not.toMatch(/1990|\d{4}-\d{2}-\d{2}/);
    expect(fila).toEqual({ profesor_id: null, remitente_nombre: 'Agenda Clases App', responder_a: null, tipo: 'aviso_inactividad' });
    expect(await mailsA(aviso.mail, asunto)).toBe(1);
  });
  it('CA-32_una_segunda_corrida_el_mismo_dia_no_repite_el_aviso_ni_avisa_a_quien_vence_en_8_dias', async () => {
    const asunto = 'Tus datos en Agenda Clases App se borran en 7 días';
    const r2 = await correr('retencion');
    await new Promise((res) => setTimeout(res, 1500));
    registrar('CA-32_segunda', { corrida: 2 }, { r2, a_aviso: await mailsA(aviso.mail, asunto), a_lejana: await mailsA(lejana.mail, asunto) });
    expect(Number(r2.cantidades?.avisos)).toBe(0);
    expect(await mailsA(aviso.mail, asunto)).toBe(1);
    expect(await mailsA(lejana.mail, asunto)).toBe(0);
    const [m] = await sql<{ aviso_inactividad_en: Date | null }>('select aviso_inactividad_en from public.alumno where id = $1', [lejana.id]);
    expect(m.aviso_inactividad_en).toBeNull();
  });
});

describe('CA-31 / AVI-05 / AVI-07 recordatorio de la clase confirmada', () => {
  it('CA-31_una_clase_confirmada_genera_exactamente_un_recordatorio_con_el_nombre_del_profesor_y_Reply-To', async () => {
    await fijarReloj(AHORA);
    const rec = await persona('t11rec', 'T11 Recordada', ids, { creado: AHORA, con: { PA: 'aprobado' } });
    const dentro = await clase(ids.PA, rec.id, desde(24 * HORA), { segundos: 1, confirmada: desde(-3 * DIA) });
    const fuera = await clase(ids.PA, rec.id, desde(25 * HORA), { segundos: 1, confirmada: desde(-3 * DIA) });
    const r1 = await correr('recordatorios');
    const asunto = 'Recordatorio: tu clase con Profesor de Prueba';
    const m = await esperarMailCon(rec.mail, asunto, 'Te recordamos tu clase');
    const r2 = await correr('recordatorios');
    await new Promise((res) => setTimeout(res, 1500));
    const marcas = await sql<{ id: string; marcada: boolean }>('select id, recordatorio_en is not null as marcada from public.clase where id = any($1::uuid[])', [[dentro, fuera]]);
    const [fila] = await sql<{ n: string; profesor_id: string; remitente_nombre: string; responder_a: string }>(
      `select count(*)::text as n, min(profesor_id::text) as profesor_id, min(remitente_nombre) as remitente_nombre, min(responder_a) as responder_a
         from public.mail_salida where alumno_id = $1 and tipo = 'recordatorio'`,
      [rec.id],
    );
    registrar('CA-31', { clase: desde(24 * HORA), fuera: desde(25 * HORA), reloj: AHORA }, { r1, r2, fila, from: m.From, replyTo: m.ReplyTo, marcas });
    expect(r1.ok && r2.ok).toBe(true);
    expect(Number(r2.cantidades?.recordatorios)).toBe(0);
    expect(fila).toEqual({ n: '1', profesor_id: ids.PA, remitente_nombre: 'Profesor de Prueba', responder_a: MAIL_PROFESOR });
    expect(m.From.Name).toBe('Profesor de Prueba');
    expect(m.ReplyTo?.map((x) => x.Address)).toEqual([MAIL_PROFESOR]);
    expect(await mailsA(rec.mail, asunto)).toBe(1);
    expect(marcas.find((x) => x.id === dentro)?.marcada).toBe(true);
    expect(marcas.find((x) => x.id === fuera)?.marcada).toBe(false);
  });
});
