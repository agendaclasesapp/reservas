// B07 · T07.3 · responder_solicitud con dos profesores por la API real (PostgREST local, como la usa la web) y los mails de respuesta
// en Mailpit. Casos del plan: T-RES-05, T-RES-06, T-RES-07, T-SOL-22 (rama B07), T-SOL-25, T-NFR-12 (rama confirmación), T-AVI-03.
// CA: CA-18, CA-34, CA-41 (rama B07), CA-55, CA-56, CA-63 (rama B07). IDs: SOL-04, SOL-05, SOL-06, SOL-10, PRF-07, PRF-08, AVI-03, AVI-07,
// SEC-06, SEC-09, SEC-29. Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo; la profesora B trabaja en Europe/Madrid.
// Datos sintéticos de las sesiones compartidas (tests/soporte/usuarios.ts); lo que crean se limpia al terminar.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj } from '../../soporte/reloj';
import { rpc, rest, sesionDe, MAIL_PROFESOR, MAIL_PROFESOR_B, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import {
  AHORA,
  alumnoDe,
  detalle,
  esperarMailCon,
  idsProfesores,
  leer,
  limpiarB07,
  madrid,
  mensaje,
  pedirReserva,
  prepararB07,
  registrar,
  responder,
  slot,
  terminarB07,
  type Ids,
} from './ayuda';

let ids: Ids;
const ROLES_USADOS: Rol[] = ['alumno', 'alumnoB', 'dosVinculos', 'rechazado', 'pendiente', 'profesor', 'profesorB', 'administrador'];

beforeAll(async () => {
  for (const r of ROLES_USADOS) await sesionDe(r);
  ids = await idsProfesores();
  await prepararB07();
}, 300_000);
afterEach(async () => {
  await fijarReloj(AHORA);
  await sql('update public.profesor set activo = true');
  await sql(`update public.profesor set zona_horaria = 'America/Montevideo'`);
  await sql(`delete from public.inscripcion where alumno_id = $1 and profesor_id = $2`, [await alumnoDe('alumno'), ids.PB]);
  await limpiarB07();
});
afterAll(async () => {
  await terminarB07();
  await cerrar();
});

const estadoSolicitud = async (id: string) =>
  (await sql<{ estado: string; motivo: string | null; clases: string }>(
    `select s.estado, s.motivo, (select string_agg(distinct c.estado, ',') from public.clase c where c.reserva_id = s.reserva_id) as clases from public.solicitud s where s.id = $1`,
    [id],
  ))[0];
const hora = (iso: string, zona: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
async function estadoHueco(slug: string, dia: string, h: string, zona = 'America/Montevideo'): Promise<string | undefined> {
  const r = await rpc('anon', 'agenda_publica', { p_slug: slug, p_dia: dia });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return (r.cuerpo as { inicio: string; estado: string }[]).find((x) => hora(x.inicio, zona) === h)?.estado;
}
const marca = (prefijo: string) => `${prefijo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;

describe('CA-55 / SEC-06 / SOL-04 solo el profesor de la solicitud la responde', () => {
  it('CA-55_T-SOL-25_B_no_confirma_ni_rechaza_la_solicitud_de_A_(404_igual_que_un_id_inexistente)_y_A_si', async () => {
    const p = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'));
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    const id = p.solicitudId!;
    const inexistente = await responder('profesorB', '00000000-0000-0000-0000-00000000dead', 'confirmar');
    const bConfirma = await responder('profesorB', id, 'confirmar');
    const bRechaza = await responder('profesorB', id, 'rechazar', 'no');
    registrar('CA-55_T-SOL-25', { solicitud: id, como: 'profesorB' }, { confirmar: [bConfirma.status, bConfirma.cuerpo], rechazar: [bRechaza.status, bRechaza.cuerpo], inexistente: [inexistente.status, inexistente.cuerpo] });
    for (const r of [bConfirma, bRechaza]) {
      expect(r.status).toBe(404);
      expect(mensaje(r)).toBe('NO_ENCONTRADO');
      expect(r.cuerpo, 'igual que un id inexistente: no revela que la solicitud existe').toEqual(inexistente.cuerpo);
    }
    expect((await estadoSolicitud(id)).estado).toBe('pendiente');
    expect((await leer('profesorB', 'v_solicitudes_pendientes')).length).toBe(0);
    expect((await leer<{ id: string }>('profesor', 'v_solicitudes_pendientes')).map((s) => s.id)).toEqual([id]);
    const a = await responder('profesor', id, 'confirmar');
    registrar('CA-55_T-SOL-25_A', { solicitud: id, como: 'profesor' }, { status: a.status, cuerpo: a.cuerpo });
    expect([a.status, a.cuerpo]).toEqual([200, { estado: 'confirmada' }]);
    expect(await estadoSolicitud(id)).toMatchObject({ estado: 'confirmada', clases: 'confirmada' });
  });

  it('SEC-06_la_persona_el_Administrador_y_anon_no_responden_y_nada_cambia', async () => {
    const id = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    expect((await responder('alumno', id, 'confirmar')).status).toBe(403);
    expect((await responder('dosVinculos', id, 'rechazar')).status).toBe(403);
    expect((await responder('administrador', id, 'confirmar')).status).toBe(403);
    expect((await responder('anon', id, 'confirmar')).status).toBeGreaterThanOrEqual(401);
    expect((await estadoSolicitud(id)).estado).toBe('pendiente');
  });

  it('SOL-04_responder_dos_veces_da_409_SOLICITUD_YA_RESPONDIDA_y_no_cambia_el_resultado', async () => {
    const id = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    expect((await responder('profesor', id, 'rechazar', 'Sin lugar')).status).toBe(200);
    const otra = await responder('profesor', id, 'confirmar');
    expect([otra.status, mensaje(otra)]).toEqual([409, 'SOLICITUD_YA_RESPONDIDA']);
    expect(await estadoSolicitud(id)).toMatchObject({ estado: 'rechazada', motivo: 'Sin lugar', clases: 'rechazada' });
    expect(await estadoHueco(SLUG_A, '2026-11-04', '10:00')).toBe('libre');
  });
});

describe('SEC-09 entradas de responder_solicitud', () => {
  it('SEC-09_decision_invalida_y_motivo_de_501_dan_422_con_el_campo_y_no_cambian_nada_y_un_motivo_de_500_pasa', async () => {
    const id = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    const d = await responder('profesor', id, 'aprobar');
    const m = await responder('profesor', id, 'confirmar', 'x'.repeat(501));
    registrar('SEC-09', { decision: 'aprobar', motivo: '501 caracteres' }, { decision: [d.status, d.cuerpo], motivo: [m.status, m.cuerpo] });
    expect([d.status, mensaje(d), detalle(d)]).toEqual([422, 'DATOS_INVALIDOS', { campo: 'p_decision' }]);
    expect([m.status, mensaje(m), detalle(m)]).toEqual([422, 'DATOS_INVALIDOS', { campo: 'motivo' }]);
    expect(await estadoSolicitud(id)).toMatchObject({ estado: 'pendiente', motivo: null, clases: 'pendiente' });
    const ok = await responder('profesor', id, 'rechazar', 'y'.repeat(500));
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    expect((await estadoSolicitud(id)).motivo).toHaveLength(500);
  });
  it('SEC-09_un_motivo_en_blanco_se_guarda_como_nulo_y_el_texto_con_html_se_guarda_tal_cual_(SEC-16_se_escapa_al_mostrarlo)', async () => {
    const a = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    const b = (await pedirReserva('dosVinculos', ids.PA, slot('2026-11-04', '11:00'))).solicitudId!;
    expect((await responder('profesor', a, 'rechazar', '   ')).status).toBe(200);
    const html = '<img src=x onerror=alert(1)> sin cupo';
    expect((await responder('profesor', b, 'rechazar', html)).status).toBe(200);
    expect((await estadoSolicitud(a)).motivo).toBeNull();
    expect((await estadoSolicitud(b)).motivo).toBe(html);
  });
});

describe('CA-18 / RES-02 la serie confirmada ocupa los huecos de las semanas siguientes', () => {
  it('CA-18_T-RES-05_la_serie_semanal_confirmada_ocupa_cada_lunes_y_rechazada_los_libera', async () => {
    const p = await pedirReserva('alumno', ids.PA, slot('2026-11-09', '10:00'), { p_tipo: 'serie', p_frecuencia: 1 });
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    const r = await responder('profesor', p.solicitudId!, 'confirmar');
    registrar('CA-18_T-RES-05', { serie: 'semanal desde 2026-11-09 10:00' }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(200);
    const huecos = [];
    for (const dia of ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']) huecos.push(await estadoHueco(SLUG_A, dia, '10:00'));
    expect(huecos).toEqual(['ocupado', 'ocupado', 'ocupado', 'ocupado']);
    expect(await estadoHueco(SLUG_A, '2026-11-10', '10:00')).toBe('libre');
    expect(await estadoHueco(SLUG_B, '2026-11-16', '10:00', 'America/Montevideo')).toBe('libre');
    expect((await estadoSolicitud(p.solicitudId!)).clases).toBe('confirmada');
    // T-RES-07: una serie rechazada libera todas sus ocurrencias.
    const q = await pedirReserva('dosVinculos', ids.PA, slot('2026-11-11', '09:00'), { p_tipo: 'serie', p_frecuencia: 1 });
    expect((await responder('profesor', q.solicitudId!, 'rechazar', 'Sin cupo')).status).toBe(200);
    expect(await estadoSolicitud(q.solicitudId!)).toMatchObject({ estado: 'rechazada', clases: 'rechazada' });
    for (const dia of ['2026-11-11', '2026-11-18', '2026-11-25']) expect(await estadoHueco(SLUG_A, dia, '09:00'), dia).toBe('libre');
  });
  it('CA-18_T-RES-06_la_serie_quincenal_confirmada_ocupa_las_semanas_1_y_3_y_deja_libres_la_2_y_la_4', async () => {
    const p = await pedirReserva('alumno', ids.PA, slot('2026-11-10', '10:00'), { p_tipo: 'serie', p_frecuencia: 2 });
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    expect((await responder('profesor', p.solicitudId!, 'confirmar')).status).toBe(200);
    const huecos = [];
    for (const dia of ['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01']) huecos.push(await estadoHueco(SLUG_A, dia, '10:00'));
    registrar('CA-18_T-RES-06', { serie: 'quincenal desde 2026-11-10 10:00' }, { huecos });
    expect(huecos).toEqual(['ocupado', 'libre', 'ocupado', 'libre']);
  });
});

describe('CA-41 rama de B07: responder una de las diez pendientes libera el tope (SOL-10, T-SOL-22)', () => {
  const diez = [slot('2026-11-03', '12:00'), ...['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'].map((h) => slot('2026-11-04', h))];
  async function llenar(): Promise<string[]> {
    const ids10: string[] = [];
    for (const inicio of diez) {
      const r = await pedirReserva('alumno', ids.PA, inicio);
      expect(r.status, `${inicio}: ${JSON.stringify(r.cuerpo)}`).toBe(200);
      ids10.push(r.solicitudId!);
    }
    return ids10;
  }
  for (const decision of ['confirmar', 'rechazar'] as const) {
    it(`CA-41_T-SOL-22_tras_${decision}_una_de_las_diez_la_undecima_se_acepta_con_la_RPC_real_del_profesor`, async () => {
      const lista = await llenar();
      const undecima = slot('2026-11-05', '09:00');
      const antes = await pedirReserva('alumno', ids.PA, undecima);
      expect([antes.status, mensaje({ status: antes.status, cuerpo: antes.cuerpo })]).toEqual([429, 'LIMITE_EXCEDIDO']);
      const resp = await responder('profesor', lista[0], decision);
      expect(resp.status, JSON.stringify(resp.cuerpo)).toBe(200);
      const despues = await pedirReserva('alumno', ids.PA, undecima);
      registrar(`CA-41_${decision}`, { pendientes_con_A: 10, respondida: decision, undecima }, { antes: antes.status, despues: despues.status, cuerpo: despues.cuerpo });
      expect(despues.status, JSON.stringify(despues.cuerpo)).toBe(200);
      const [n] = await sql<{ n: number }>('select privado.contar_pendientes($1, $2) as n', [await alumnoDe('alumno'), ids.PA]);
      expect(n.n).toBe(10);
      const otra = await pedirReserva('alumno', ids.PA, slot('2026-11-05', '10:00'));
      expect(otra.status).toBe(429);
    });
  }
});

describe('CA-34 con un envío que falla, confirmar funciona y el fallo aparece en Mails fallidos (NFR-07)', () => {
  it('CA-34_T-NFR-12_con_un_destinatario_inválido_confirmar_da_200_y_el_mail_queda_fallido_visible_solo_al_profesor_de_la_solicitud', async () => {
    const a = await alumnoDe('alumno');
    const [antes] = await sql<{ mail: string }>('select mail::text as mail from public.alumno where id = $1', [a]);
    const id = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    await sql(`update public.alumno set mail = 'sin-arroba' where id = $1`, [a]);
    try {
      const r = await responder('profesor', id, 'confirmar');
      registrar('CA-34', { destinatario: 'sin-arroba' }, { status: r.status, cuerpo: r.cuerpo });
      expect([r.status, r.cuerpo]).toEqual([200, { estado: 'confirmada' }]);
      expect(await estadoSolicitud(id)).toMatchObject({ estado: 'confirmada', clases: 'confirmada' });
      const [m] = await sql<{ estado: string; motivo_fallo: string }>(`select estado, motivo_fallo from public.mail_salida where tipo = 'solicitud_respondida' and destinatario = 'sin-arroba'`);
      expect(m).toEqual({ estado: 'fallido', motivo_fallo: 'DESTINATARIO_INVALIDO' });
      const fallidos = await leer<{ fecha: string; destinatario: string; tipo: string; motivo: string }>('profesor', 'v_mails_fallidos', 'destinatario=eq.sin-arroba');
      expect(fallidos).toHaveLength(1);
      expect(fallidos[0]).toMatchObject({ destinatario: 'sin-arroba', tipo: 'solicitud_respondida', motivo: 'DESTINATARIO_INVALIDO' });
      expect(Number.isNaN(Date.parse(fallidos[0].fecha))).toBe(false);
      expect(await leer('profesorB', 'v_mails_fallidos', 'destinatario=eq.sin-arroba')).toHaveLength(0);
    } finally {
      await sql('update public.alumno set mail = $2 where id = $1', [a, antes.mail]);
    }
  });
});

describe('CA-63 rama de B07: con el profesor inactivo confirmar da 409 y rechazar sí', () => {
  it('CA-63_PRF-08_con_A_inactivo_confirmar_da_409_PROFESOR_INACTIVO_rechazar_funciona_y_B_no_cambia', async () => {
    const confirmada = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '09:00'))).solicitudId!;
    expect((await responder('profesor', confirmada, 'confirmar')).status).toBe(200);
    const pendiente = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    const deB = (await pedirReserva('alumnoB', ids.PB, slot('2026-11-04', '10:00'))).solicitudId!;
    await sql('update public.profesor set activo = false where id = $1', [ids.PA]);
    const c = await responder('profesor', pendiente, 'confirmar');
    const m = await responder('profesor', pendiente, 'rechazar', 'x'.repeat(501));
    registrar('CA-63_PRF-08', { profesor: 'A inactivo', solicitud: pendiente }, { confirmar: [c.status, c.cuerpo], motivoLargo: [m.status, m.cuerpo] });
    expect([c.status, mensaje(c)]).toEqual([409, 'PROFESOR_INACTIVO']);
    expect(m.status).toBe(422);
    expect((await estadoSolicitud(pendiente)).estado).toBe('pendiente');
    const r = await responder('profesor', pendiente, 'rechazar', 'Estoy de licencia');
    expect([r.status, r.cuerpo]).toEqual([200, { estado: 'rechazada' }]);
    expect(await estadoSolicitud(pendiente)).toMatchObject({ estado: 'rechazada', motivo: 'Estoy de licencia', clases: 'rechazada' });
    const clases = await leer<{ estado: string }>('alumno', 'v_mis_clases', `profesor_id=eq.${ids.PA}&estado=eq.confirmada`);
    expect(clases, 'las clases confirmadas con A siguen en Mis clases').toHaveLength(1);
    const rb = await responder('profesorB', deB, 'confirmar');
    expect(rb.status, 'lo de B no cambia con A inactivo').toBe(200);
  });
});

describe('AVI-03 / AVI-07 / CA-56 / SEC-29 mail de respuesta en Mailpit', () => {
  it('CA-56_AVI-07_el_mail_de_confirmacion_de_A_sale_con_el_nombre_de_A_y_Reply-To_a_su_mail_y_el_de_B_con_los_de_B_con_la_hora_de_su_huso', async () => {
    const al = await alumnoDe('alumno');
    await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, $2, 'aprobado', now())`, [al, ids.PB]);
    await sql(`update public.profesor set zona_horaria = 'Europe/Madrid' where id = $1`, [ids.PB]);
    const mA = marca('Nos vemos A');
    const mB = marca('Nos vemos B');
    const a = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'));
    const b = await pedirReserva('alumno', ids.PB, madrid('2026-11-04', '10:00'));
    expect([a.status, b.status], JSON.stringify([a.cuerpo, b.cuerpo])).toEqual([200, 200]);
    expect((await responder('profesor', a.solicitudId!, 'confirmar', mA)).status).toBe(200);
    expect((await responder('profesorB', b.solicitudId!, 'confirmar', mB)).status).toBe(200);
    const para = (await sesionDe('alumno')).mail!;
    const mailA = await esperarMailCon(para, 'Profesor de Prueba confirmó tu solicitud de reserva', mA);
    const mailB = await esperarMailCon(para, 'Profesora B de Prueba confirmó tu solicitud de reserva', mB);
    registrar(
      'CA-56',
      { respuestas: ['A confirma', 'B confirma'] },
      { A: { from: mailA.From, replyTo: mailA.ReplyTo, asunto: mailA.Subject }, B: { from: mailB.From, replyTo: mailB.ReplyTo, asunto: mailB.Subject } },
    );
    expect(mailA.From.Name).toBe('Profesor de Prueba');
    expect(mailA.ReplyTo?.map((r) => r.Address)).toEqual([MAIL_PROFESOR]);
    expect(mailB.From.Name).toBe('Profesora B de Prueba');
    expect(mailB.ReplyTo?.map((r) => r.Address)).toEqual([MAIL_PROFESOR_B]);
    expect(mailA.From.Address).toBe(mailB.From.Address); // la casilla es una sola (NFR-09)
    expect(mailA.Text).toContain('Clase del 04/11/2026 a las 10:00 (hora de America/Montevideo)');
    expect(mailB.Text).toContain('Clase del 04/11/2026 a las 10:00 (hora de Europe/Madrid)');
    expect(mailA.Text).toContain(`Mensaje: ${mA}`);
    expect(mailB.Text).not.toContain(mA);
    expect(mailA.To.map((t) => t.Address)).toEqual([para]);
  });

  it('AVI-03_SEC-29_el_rechazo_lleva_Motivo_y_quien_toma_la_clase_y_ningun_mail_trae_fecha_de_nacimiento_ni_de_la_persona_a_cargo', async () => {
    const al = await alumnoDe('alumno');
    const alta = await rpc('alumno', 'guardar_persona_a_cargo', { p_id: null, p_nombre: 'T06 Hija T07', p_fecha_nacimiento: '2015-05-05' });
    expect(alta.status, JSON.stringify(alta.cuerpo)).toBe(200);
    const [pac] = await sql<{ id: string }>(`select id from public.persona_a_cargo where nombre = 'T06 Hija T07'`);
    const motivo = marca('Sin cupo');
    const p = await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'), { p_persona_a_cargo_id: pac.id, p_tipo: 'serie', p_frecuencia: 2 });
    expect(p.status, JSON.stringify(p.cuerpo)).toBe(200);
    expect((await responder('profesor', p.solicitudId!, 'rechazar', motivo)).status).toBe(200);
    const para = (await sesionDe('alumno')).mail!;
    const mail = await esperarMailCon(para, 'Profesor de Prueba rechazó tu solicitud de reserva', motivo);
    registrar('AVI-03_SEC-29', { persona_a_cargo: 'T06 Hija T07', serie: 'quincenal' }, { asunto: mail.Subject, texto: mail.Text });
    expect(mail.Text).toContain(`Motivo: ${motivo}`);
    expect(mail.Text).toContain('Serie quincenal desde el 04/11/2026 a las 10:00');
    expect(mail.Text).toContain('Toma la clase: T06 Hija T07');
    expect(mail.Text).not.toMatch(/2015|2000|05\/05|01\/01|nacimiento/i);
    const [fila] = await sql<{ cuerpo_texto: string }>(`select cuerpo_texto from public.mail_salida where tipo = 'solicitud_respondida' and alumno_id = $1`, [al]);
    expect(fila.cuerpo_texto).not.toMatch(/2015|2000|05\/05|01\/01|nacimiento/i);
  });

  it('CA-55_AVI-03_la_respuesta_va_solo_al_titular_y_una_solicitud_rechazada_por_la_RPC_no_encola_mail', async () => {
    const id = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    await responder('profesorB', id, 'confirmar');
    await responder('alumno', id, 'confirmar');
    await responder('profesor', id, 'confirmar', 'x'.repeat(501));
    const [n] = await sql<{ n: number }>(`select count(*)::int as n from public.mail_salida where tipo = 'solicitud_respondida'`);
    expect(n.n).toBe(0);
    expect((await responder('profesor', id, 'confirmar')).status).toBe(200);
    const filas = await sql<{ destinatario: string; profesor_id: string }>(`select destinatario, profesor_id from public.mail_salida where tipo = 'solicitud_respondida'`);
    expect(filas).toEqual([{ destinatario: (await sesionDe('alumno')).mail, profesor_id: ids.PA }]);
  });
});

describe('SEC-06 respuesta sobre solicitudes y rutas REST', () => {
  it('SEC-06_solicitud_no_se_actualiza_por_REST_para_confirmarla_sin_pasar_por_la_RPC', async () => {
    const id = (await pedirReserva('alumno', ids.PA, slot('2026-11-04', '10:00'))).solicitudId!;
    const r = await rest('profesor', 'PATCH', `solicitud?id=eq.${id}`, { estado: 'confirmada' }, { Prefer: 'return=representation' });
    registrar('SEC-06_REST', { patch: 'solicitud.estado' }, { status: r.status, cuerpo: r.cuerpo });
    expect([401, 403, 404]).toContain(r.status);
    expect((await estadoSolicitud(id)).estado).toBe('pendiente');
    const w = await rest('profesor', 'PATCH', `v_clases?id=eq.${id}`, { estado: 'confirmada' });
    expect([401, 403, 404]).toContain(w.status);
  });
});
