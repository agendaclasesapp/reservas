// B08 · T08.3 · solicitar_movimiento, solicitar_cancelacion y las ramas de responder_solicitud por la API real (PostgREST local, como la
// usa la web) con dos profesores, y los mails en Mailpit. La atomicidad con fallo inyectado (NFR-03, SEC-08) vive en
// supabase/tests/08_mover_cancelar.test.sql: aquí no se instalan triggers en la base compartida.
// CA: CA-13, CA-22, CA-23, CA-24, CA-41, CA-63. IDs: SOL-02, SOL-03, SOL-07, SOL-10, AGE-11, RES-05, RES-07, AVI-02, AVI-03, SEC-06, SEC-10.
// Casos: T-AGE-07 (+20 h). Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo. Datos de las sesiones compartidas; se limpian al terminar.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { MAIL_PROFESOR, rpc, sesionDe, type Rol } from '../../soporte/usuarios';
import {
  AHORA,
  alumnoDe,
  cancelar,
  claseEn,
  confirmada,
  cuenta,
  detalle,
  esperarNuevo,
  estadoClase,
  fijarReloj,
  idsProfesores,
  leer,
  limpiarB07,
  mailsCon,
  mensaje,
  mover,
  pedirReserva,
  prepararB07,
  registrar,
  responder,
  slot,
  terminarB07,
  type Ids,
} from './ayuda';

let ids: Ids;
let nombre: string;
let mailAlumno: string;
const ROLES_USADOS: Rol[] = ['alumno', 'alumnoB', 'dosVinculos', 'pendiente', 'profesor', 'profesorB', 'administrador'];

beforeAll(async () => {
  for (const r of ROLES_USADOS) await sesionDe(r);
  ids = await idsProfesores();
  await prepararB07();
  const s = await sesionDe('alumno');
  mailAlumno = s.mail!;
  nombre = (await sql<{ nombre: string }>('select nombre from public.alumno where id = $1', [s.alumnoId]))[0].nombre;
}, 300_000);
afterEach(async () => {
  await fijarReloj(AHORA);
  await sql('update public.profesor set activo = true');
  await sql('delete from public.grilla_tramo where profesor_id = $1 and dia_semana = 6', [ids.PB]);
  await sql(`delete from public.inscripcion where alumno_id = $1 and profesor_id = $2`, [await alumnoDe('alumno'), ids.PB]);
  await limpiarB07();
});
afterAll(async () => {
  await terminarB07();
  await cerrar();
});

const hora = (iso: string, zona = 'America/Montevideo') => new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
async function estadoHueco(slug: string, dia: string, h: string): Promise<string | undefined> {
  const r = await rpc('anon', 'agenda_publica', { p_slug: slug, p_dia: dia });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return (r.cuerpo as { inicio: string; estado: string }[]).find((x) => hora(x.inicio) === h)?.estado;
}
const SLUG = 'profesor-prueba';
const marca = (prefijo: string) => `${prefijo} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
const solicitudDe = async (clase: string) =>
  (await sql<{ id: string; estado: string }>(`select id, estado from public.solicitud where clase_id = $1 order by creada_en desc limit 1`, [clase]))[0];
const aprobarConB = async () => {
  await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, $2, 'aprobado', now())`, [await alumnoDe('alumno'), ids.PB]);
};
const cambiosPedidos = async () => cuenta(`select count(*) n from public.solicitud where tipo <> 'reserva' and alumno_id = $1`, [await alumnoDe('alumno')]);

describe('CA-22 / CA-23 mover una clase confirmada', () => {
  it('CA-22_CA-23_movimiento_pendiente_con_el_destino_ocupado_y_aviso_al_profesor_y_luego_confirmado_con_su_mail', async () => {
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '10:00'));
    const clase = await claseEn(ids.PA, slot('2026-11-04', '10:00'));
    const avisosAntes = await mailsCon(MAIL_PROFESOR, `Solicitud de cambio de horario: ${nombre}`);
    const r = await mover('alumno', clase, slot('2026-11-11', '10:00'));
    registrar('CA-22', { clase, destino: slot('2026-11-11', '10:00'), alcance: 'solo_esta' }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const { solicitud_id, fechas, salteadas } = r.cuerpo as { solicitud_id: string; fechas: string[]; salteadas: string[] };
    expect(fechas.length).toBe(1);
    expect(salteadas).toEqual([]);
    expect(await estadoClase(clase)).toBe('confirmada');
    expect(await estadoHueco(SLUG, '2026-11-11', '10:00')).toBe('ocupado');
    expect(await estadoHueco(SLUG, '2026-11-04', '10:00')).toBe('ocupado');
    expect((await solicitudDe(clase)).estado).toBe('pendiente');
    const otra = await cancelar('alumno', clase);
    expect([otra.status, mensaje(otra)]).toEqual([409, 'SOLICITUD_EN_CURSO']);
    expect(detalle(otra).solicitud_id).toBe(solicitud_id);
    const aviso = await esperarNuevo(MAIL_PROFESOR, `Solicitud de cambio de horario: ${nombre}`, avisosAntes);
    expect(aviso.Text).toContain('Clase del 04/11/2026 a las 10:00');
    expect(aviso.Text).toContain('Nuevo horario: 11/11/2026 a las 10:00');
    expect(aviso.Text).toContain('Alcance: solo esta clase');
    // B no responde la solicitud de A.
    expect((await responder('profesorB', solicitud_id, 'confirmar')).status).toBe(404);
    const mensajeProfesor = marca('Perfecto');
    const respondidosAntes = await mailsCon(mailAlumno, 'Profesor de Prueba confirmó tu solicitud de cambio de horario');
    const c = await responder('profesor', solicitud_id, 'confirmar', mensajeProfesor);
    expect([c.status, c.cuerpo]).toEqual([200, { estado: 'confirmada' }]);
    expect(await estadoClase(clase)).toBe('movida');
    expect(await estadoHueco(SLUG, '2026-11-04', '10:00')).toBe('libre');
    expect(await estadoHueco(SLUG, '2026-11-11', '10:00')).toBe('ocupado');
    const destino = await sql<{ estado: string }>(`select estado from public.clase where profesor_id = $1 and inicio = $2::timestamptz`, [ids.PA, slot('2026-11-11', '10:00')]);
    expect(destino.map((d) => d.estado)).toEqual(['confirmada']);
    const mail = await esperarNuevo(mailAlumno, 'Profesor de Prueba confirmó tu solicitud de cambio de horario', respondidosAntes);
    registrar('CA-23', { solicitud: solicitud_id, decision: 'confirmar', mensaje: mensajeProfesor }, { asunto: mail.Subject, texto: mail.Text });
    expect(mail.Text).toContain('Nuevo horario: 11/11/2026 a las 10:00');
    expect(mail.Text).toContain('Alcance: solo esta clase');
    expect(mail.Text).toContain(`Mensaje: ${mensajeProfesor}`);
  });

  it('CA-23_el_rechazo_deja_todo_como_estaba_y_el_mail_lleva_el_motivo', async () => {
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '11:00'));
    const clase = await claseEn(ids.PA, slot('2026-11-04', '11:00'));
    const r = await mover('alumno', clase, slot('2026-11-11', '11:00'));
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const motivo = marca('Ese día no atiendo');
    const antes = await mailsCon(mailAlumno, 'Profesor de Prueba rechazó tu solicitud de cambio de horario');
    const x = await responder('profesor', (r.cuerpo as { solicitud_id: string }).solicitud_id, 'rechazar', motivo);
    expect([x.status, x.cuerpo]).toEqual([200, { estado: 'rechazada' }]);
    expect(await estadoClase(clase)).toBe('confirmada');
    expect(await estadoHueco(SLUG, '2026-11-11', '11:00')).toBe('libre');
    expect(await estadoHueco(SLUG, '2026-11-04', '11:00')).toBe('ocupado');
    const mail = await esperarNuevo(mailAlumno, 'Profesor de Prueba rechazó tu solicitud de cambio de horario', antes);
    registrar('CA-23_rechazo', { motivo }, { asunto: mail.Subject, texto: mail.Text });
    expect(mail.Text).toContain(`Motivo: ${motivo}`);
    expect(mail.Text).toContain('Nuevo horario: 11/11/2026 a las 11:00');
  });
});

describe('CA-24 avisar que no puede ir (cancelación)', () => {
  it('CA-24_la_cancelacion_confirmada_libera_el_hueco_y_la_rechazada_la_deja_con_el_motivo_en_el_mail', async () => {
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '14:00'));
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '15:00'));
    const c1 = await claseEn(ids.PA, slot('2026-11-04', '14:00'));
    const c2 = await claseEn(ids.PA, slot('2026-11-04', '15:00'));
    const avisosAntes = await mailsCon(MAIL_PROFESOR, `Aviso de que no puede ir: ${nombre}`);
    const a = await cancelar('alumno', c1);
    expect(a.status, JSON.stringify(a.cuerpo)).toBe(200);
    expect(await estadoClase(c1)).toBe('confirmada');
    expect(await estadoHueco(SLUG, '2026-11-04', '14:00')).toBe('ocupado');
    const aviso = await esperarNuevo(MAIL_PROFESOR, `Aviso de que no puede ir: ${nombre}`, avisosAntes);
    expect(aviso.Text).toContain('Clase del 04/11/2026 a las 14:00');
    expect(aviso.Text).not.toContain('Nuevo horario');
    const b = await cancelar('alumno', c2);
    expect(b.status).toBe(200);
    const conf = await responder('profesor', (a.cuerpo as { solicitud_id: string }).solicitud_id, 'confirmar', marca('Gracias por avisar'));
    expect([conf.status, conf.cuerpo]).toEqual([200, { estado: 'confirmada' }]);
    expect(await estadoClase(c1)).toBe('cancelada');
    expect(await estadoHueco(SLUG, '2026-11-04', '14:00')).toBe('libre');
    const motivo = marca('Necesito esa clase');
    const antes = await mailsCon(mailAlumno, 'Profesor de Prueba rechazó tu solicitud de cancelación');
    const rech = await responder('profesor', (b.cuerpo as { solicitud_id: string }).solicitud_id, 'rechazar', motivo);
    expect(rech.status).toBe(200);
    expect(await estadoClase(c2)).toBe('confirmada');
    expect(await estadoHueco(SLUG, '2026-11-04', '15:00')).toBe('ocupado');
    const mail = await esperarNuevo(mailAlumno, 'Profesor de Prueba rechazó tu solicitud de cancelación', antes);
    registrar('CA-24_rechazo', { motivo }, { asunto: mail.Subject, texto: mail.Text });
    expect(mail.Text).toContain(`Motivo: ${motivo}`);
    expect(mail.Text).toContain('Clase del 04/11/2026 a las 15:00');
  });

  it('CA-24_de_aca_en_adelante_termina_la_serie_y_cancela_las_clases_siguientes', async () => {
    await confirmada('alumno', 'profesor', ids, slot('2026-11-09', '10:00'), { p_tipo: 'serie', p_frecuencia: 1 });
    const clase = await claseEn(ids.PA, slot('2026-11-30', '10:00'));
    const r = await cancelar('alumno', clase, 'desde_aca');
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(await estadoHueco(SLUG, '2026-12-07', '10:00')).toBe('ocupado');
    const c = await responder('profesor', (r.cuerpo as { solicitud_id: string }).solicitud_id, 'confirmar');
    expect(c.status).toBe(200);
    const f = await sql<{ hasta: string; estado: string }>(`select r.hasta::text, r.estado from public.reserva r join public.clase c on c.reserva_id = r.id where c.id = $1`, [clase]);
    registrar('CA-24_serie', { clase, alcance: 'desde_aca' }, f[0]);
    expect(f[0]).toEqual({ hasta: '2026-11-29', estado: 'confirmada' });
    expect(await estadoHueco(SLUG, '2026-12-07', '10:00')).toBe('libre');
    expect(await estadoHueco(SLUG, '2026-11-23', '10:00')).toBe('ocupado');
    expect(await cuenta(`select count(*) n from public.clase where profesor_id = $1 and estado = 'confirmada' and inicio < $2::timestamptz and alumno_id = $3`, [ids.PA, slot('2026-11-30', '10:00'), await alumnoDe('alumno')])).toBe(3);
  });

  it('CA-24_mover_de_aca_en_adelante_crea_la_serie_nueva_y_saltea_una_fecha_ocupada_(RES-05)', async () => {
    await confirmada('alumno', 'profesor', ids, slot('2026-11-09', '09:00'), { p_tipo: 'serie', p_frecuencia: 1 });
    await confirmada('dosVinculos', 'profesor', ids, slot('2026-12-01', '16:00'));
    const clase = await claseEn(ids.PA, slot('2026-11-23', '09:00'));
    const r = await mover('alumno', clase, slot('2026-11-24', '16:00'), 'desde_aca');
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    const { fechas, salteadas, solicitud_id } = r.cuerpo as { fechas: string[]; salteadas: string[]; solicitud_id: string };
    registrar('CA-24_mover_serie', { clase, destino: slot('2026-11-24', '16:00') }, { fechas: fechas.length, salteadas });
    expect(salteadas.map((s) => new Date(s).toISOString())).toEqual([new Date(slot('2026-12-01', '16:00')).toISOString()]);
    expect(fechas.length).toBeGreaterThanOrEqual(15);
    expect((await responder('profesor', solicitud_id, 'confirmar')).status).toBe(200);
    expect(await estadoClase(clase)).toBe('movida');
    expect(await estadoHueco(SLUG, '2026-11-30', '09:00')).toBe('libre');
    expect(await estadoHueco(SLUG, '2026-11-24', '16:00')).toBe('ocupado');
    expect(await estadoHueco(SLUG, '2026-11-16', '09:00')).toBe('ocupado');
    const nuevas = await cuenta(
      `select count(*) n from public.clase where profesor_id = $1 and alumno_id = $2 and estado = 'confirmada' and extract(isodow from inicio at time zone 'America/Montevideo') = 2`,
      [ids.PA, await alumnoDe('alumno')],
    );
    expect(nuevas).toBe(fechas.length);
    const mias = await leer<{ estado: string }>('alumno', 'v_mis_clases', `inicio=eq.${encodeURIComponent(slot('2026-11-24', '16:00'))}`);
    expect(mias.map((c) => c.estado)).toEqual(['confirmada']);
  });
});

describe('CA-13 / T-AGE-07 a +20 h se rechaza con el motivo y no se crea nada', () => {
  it('CA-13_T-AGE-07_mover_y_cancelar_una_clase_a_20_h_dan_422_ANTICIPACION_INSUFICIENTE', async () => {
    await fijarReloj('2026-11-01T15:00:00Z');
    await confirmada('alumno', 'profesor', ids, slot('2026-11-03', '08:00'));
    await fijarReloj(AHORA);
    const clase = await claseEn(ids.PA, slot('2026-11-03', '08:00'));
    const m = await mover('alumno', clase, slot('2026-11-13', '10:00'));
    const c = await cancelar('alumno', clase);
    registrar('CA-13_T-AGE-07', { clase, ahora: AHORA, inicio: slot('2026-11-03', '08:00') }, { mover: [m.status, m.cuerpo], cancelar: [c.status, c.cuerpo] });
    for (const r of [m, c]) {
      expect(r.status).toBe(422);
      expect(mensaje(r)).toBe('ANTICIPACION_INSUFICIENTE');
      expect(detalle(r).horas_minimas).toBe(24);
    }
    expect(await cambiosPedidos()).toBe(0);
    expect(await estadoHueco(SLUG, '2026-11-13', '10:00')).toBe('libre');
    expect(await estadoClase(clase)).toBe('confirmada');
  });

  it('CA-13_T-AGE-07_un_destino_a_20_h_tambien_se_rechaza', async () => {
    await aprobarConB();
    await confirmada('alumno', 'profesorB', ids, slot('2026-11-04', '16:00'));
    const clase = await claseEn(ids.PB, slot('2026-11-04', '16:00'));
    const r = await mover('alumno', clase, slot('2026-11-03', '08:00'));
    registrar('CA-13_destino', { clase, destino: slot('2026-11-03', '08:00') }, { status: r.status, cuerpo: r.cuerpo });
    expect([r.status, mensaje(r)]).toEqual([422, 'ANTICIPACION_INSUFICIENTE']);
    expect(await cambiosPedidos()).toBe(0);
  });
});

describe('RES-07 / AGE-11 el destino es un hueco libre de la agenda del profesor de la clase', () => {
  it('RES-07_un_hueco_de_B_o_fuera_de_grilla_da_422_FUERA_DE_GRILLA_y_uno_ocupado_409_HUECO_NO_LIBRE', async () => {
    await sql('insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values ($1, 6, $2, $3)', [ids.PB, '10:00', '11:00']);
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '10:00'));
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '11:00'));
    const clase = await claseEn(ids.PA, slot('2026-11-04', '10:00'));
    const resultados: Record<string, unknown> = {};
    for (const [caso, destino] of [
      ['sabado_de_B', slot('2026-11-14', '10:00')],
      ['no_es_hora', slot('2026-11-11', '10:30')],
      ['entre_tramos', slot('2026-11-11', '13:00')],
      ['domingo', slot('2026-11-15', '10:00')],
    ] as const) {
      const r = await mover('alumno', clase, destino);
      resultados[caso] = [r.status, mensaje(r)];
      expect([r.status, mensaje(r)], caso).toEqual([422, 'FUERA_DE_GRILLA']);
    }
    const ocupado = await mover('alumno', clase, slot('2026-11-04', '11:00'));
    registrar('RES-07', { clase }, { ...resultados, ocupado: [ocupado.status, ocupado.cuerpo] });
    expect([ocupado.status, mensaje(ocupado)]).toEqual([409, 'HUECO_NO_LIBRE']);
    expect(await cambiosPedidos()).toBe(0);
  });
});

describe('SEC-06 / SOL-09 quién puede pedir un cambio', () => {
  it('SEC-06_profesor_anon_y_persona_ajena_no_mueven_ni_cancelan_y_nada_se_escribe', async () => {
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '10:00'));
    const clase = await claseEn(ids.PA, slot('2026-11-04', '10:00'));
    const destino = slot('2026-11-11', '10:00');
    const filas: [string, Rol, 'mover' | 'cancelar'][] = [
      ['profesor mueve', 'profesor', 'mover'],
      ['profesorB cancela', 'profesorB', 'cancelar'],
      ['administrador mueve', 'administrador', 'mover'],
      ['otra persona (dosVinculos) mueve', 'dosVinculos', 'mover'],
      ['otra persona (alumnoB) cancela', 'alumnoB', 'cancelar'],
      ['anon mueve', 'anon', 'mover'],
      ['anon cancela', 'anon', 'cancelar'],
    ];
    const salida: Record<string, unknown> = {};
    for (const [caso, rol, op] of filas) {
      const r = op === 'mover' ? await mover(rol, clase, destino) : await cancelar(rol, clase);
      salida[caso] = [r.status, r.cuerpo];
      if (rol === 'anon') expect([401, 403], caso).toContain(r.status);
      else {
        expect(r.status, caso).toBe(403);
        expect(mensaje(r), caso).toBe('PROHIBIDO');
      }
    }
    registrar('SEC-06', { clase }, salida);
    expect(await cuenta(`select count(*) n from public.solicitud where tipo <> 'reserva'`)).toBe(0);
    const inexistente = await mover('alumno', '00000000-0000-0000-0000-00000000dead', destino);
    expect([inexistente.status, mensaje(inexistente)]).toEqual([404, 'NO_ENCONTRADO']);
  });

  it('SOL-03_el_alcance_y_el_destino_se_validan_(422_con_el_campo)', async () => {
    await confirmada('alumno', 'profesor', ids, slot('2026-11-04', '10:00'));
    const clase = await claseEn(ids.PA, slot('2026-11-04', '10:00'));
    expect(detalle(await mover('alumno', clase, slot('2026-11-11', '10:00'), 'siempre')).campo).toBe('p_alcance');
    expect(detalle(await cancelar('alumno', clase, 'siempre')).campo).toBe('p_alcance');
    expect((await cancelar('alumno', clase, 'desde_aca')).status).toBe(422);
    expect(detalle(await mover('alumno', clase, null)).campo).toBe('p_destino');
    expect(await cambiosPedidos()).toBe(0);
  });
});

describe('CA-41 / SOL-10 / SEC-10 el tope de 10 pendientes por profesor suma reservas, movimientos y cancelaciones', () => {
  it('CA-41_con_diez_pendientes_mezcladas_la_undecima_de_cada_tipo_da_429_y_con_B_se_acepta', async () => {
    await aprobarConB();
    const horas = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
    for (const h of horas) await confirmada('alumno', 'profesor', ids, slot('2026-11-05', h));
    await confirmada('alumno', 'profesorB', ids, slot('2026-11-04', '17:00'));
    const clases = await Promise.all(horas.map((h) => claseEn(ids.PA, slot('2026-11-05', h))));
    for (const [i, h] of ['08:00', '09:00', '10:00', '11:00'].entries()) expect((await mover('alumno', clases[i], slot('2026-11-13', h))).status).toBe(200);
    for (const i of [4, 5, 6]) expect((await cancelar('alumno', clases[i])).status).toBe(200);
    for (const h of ['14:00', '15:00', '16:00']) expect((await pedirReserva('alumno', ids.PA, slot('2026-11-13', h))).status).toBe(200);
    const alumno = await alumnoDe('alumno');
    const pendientesA = () => cuenta(`select count(*) n from public.solicitud where estado = 'pendiente' and profesor_id = $1 and alumno_id = $2`, [ids.PA, alumno]);
    expect(await pendientesA()).toBe(10);
    const avisos = await cuenta(`select count(*) n from public.mail_salida where tipo = 'solicitud_nueva' and profesor_id = $1`, [ids.PA]);
    const r1 = await pedirReserva('alumno', ids.PA, slot('2026-11-13', '17:00'));
    const r2 = await mover('alumno', clases[7], slot('2026-11-13', '12:00'));
    const r3 = await cancelar('alumno', clases[8]);
    registrar('CA-41', { pendientes: 10, undecimas: ['reserva', 'movimiento', 'cancelacion'] }, [r1, r2, r3].map((r) => [r.status, r.cuerpo]));
    for (const r of [r1, r2, r3]) {
      expect(r.status).toBe(429);
      expect(mensaje(r)).toBe('LIMITE_EXCEDIDO');
      expect(detalle(r)).toEqual({ tope: 'pendientes', limite: 10 });
    }
    expect(await pendientesA()).toBe(10);
    expect(await cuenta(`select count(*) n from public.clase where profesor_id = $1 and inicio in ($2::timestamptz, $3::timestamptz)`, [ids.PA, slot('2026-11-13', '12:00'), slot('2026-11-13', '17:00')])).toBe(0);
    expect(await cuenta(`select count(*) n from public.mail_salida where tipo = 'solicitud_nueva' and profesor_id = $1`, [ids.PA])).toBe(avisos);
    expect(await estadoHueco(SLUG, '2026-11-13', '12:00')).toBe('libre');
    // Con otro profesor el tope es aparte (CA-60).
    const claseB = await claseEn(ids.PB, slot('2026-11-04', '17:00'));
    const b = await mover('alumno', claseB, slot('2026-11-13', '08:00'));
    expect(b.status, JSON.stringify(b.cuerpo)).toBe(200);
    // Responder una de las diez libera el tope para la cancelación que había rechazado.
    const s5 = await solicitudDe(clases[4]);
    expect((await responder('profesor', s5.id, 'rechazar')).status).toBe(200);
    expect((await cancelar('alumno', clases[8])).status).toBe(200);
  }, 240_000);
});

describe('CA-63 con el profesor inactivo no se puede mover ni cancelar', () => {
  it('CA-63_mover_y_cancelar_dan_409_PROFESOR_INACTIVO_y_no_crean_nada', async () => {
    await aprobarConB();
    await confirmada('alumno', 'profesorB', ids, slot('2026-11-04', '15:00'));
    const clase = await claseEn(ids.PB, slot('2026-11-04', '15:00'));
    const clasesAntes = await cuenta('select count(*) n from public.clase where profesor_id = $1', [ids.PB]);
    const solicitudesAntes = await cuenta('select count(*) n from public.solicitud where profesor_id = $1', [ids.PB]);
    await sql('update public.profesor set activo = false where id = $1', [ids.PB]);
    const m = await mover('alumno', clase, slot('2026-11-13', '09:00'));
    const c = await cancelar('alumno', clase);
    registrar('CA-63', { profesor: 'B inactivo', clase }, { mover: [m.status, m.cuerpo], cancelar: [c.status, c.cuerpo] });
    for (const r of [m, c]) expect([r.status, mensaje(r)]).toEqual([409, 'PROFESOR_INACTIVO']);
    expect(await cuenta('select count(*) n from public.clase where profesor_id = $1', [ids.PB])).toBe(clasesAntes);
    expect(await cuenta('select count(*) n from public.solicitud where profesor_id = $1', [ids.PB])).toBe(solicitudesAntes);
    expect(await estadoClase(clase)).toBe('confirmada');
  });
});
