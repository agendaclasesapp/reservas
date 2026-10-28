// B06 · T06.3 · Correctitud de la exclusión con dos solicitudes simultáneas (CA-17: T-RES-01, T-RES-02, T-RES-03; la carga es de B13) y
// el tope de 10 pendientes por profesor (SOL-10, SEC-10: CA-41, CA-60 rama de pendientes), por la API real y por conexión directa.
// Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo. Las respuestas del profesor (confirmar o rechazar) son de B07: aquí se
// simulan por SQL con el rol postgres y el caso lo dice. Datos de las sesiones compartidas; lo que crean se limpia al terminar.
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { entorno } from '../../soporte/entorno';
import { fijarReloj } from '../../soporte/reloj';
import { rpc, sesionDe, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import { AHORA, detalle, idsProfesores, limpiarB06, mensaje, prepararB06, registrar, slot, terminarB06, type Ids } from './ayuda';

let ids: Ids;
const alumnoDe = async (rol: Rol) => (await sesionDe(rol)).alumnoId!;

beforeAll(async () => {
  for (const r of ['alumno', 'alumnoB', 'dosVinculos'] as Rol[]) await sesionDe(r);
  ids = await idsProfesores();
  await prepararB06();
}, 300_000);
afterEach(async () => {
  await fijarReloj(AHORA);
  await sql(`delete from public.inscripcion where alumno_id = $1 and profesor_id = $2`, [await alumnoDe('alumno'), ids.PB]);
  await limpiarB06();
});
afterAll(async () => {
  await terminarB06();
  await cerrar();
});

const pedir = (rol: Rol, profesor: string, inicio: string, extra: Record<string, unknown> = {}) =>
  rpc(rol, 'solicitar_reserva', { p_profesor_id: profesor, p_inicio: inicio, p_tipo: 'suelta', ...extra });

const hora = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
async function estadoHueco(slug: string, dia: string, h: string): Promise<string | undefined> {
  const r = await rpc('anon', 'agenda_publica', { p_slug: slug, p_dia: dia });
  return (r.cuerpo as { inicio: string; estado: string }[]).find((x) => hora(x.inicio) === h)?.estado;
}
const clasesEn = async (profesor: string, inicio: string) =>
  (await sql<{ n: number }>(`select count(*)::int as n from public.clase where profesor_id = $1 and inicio = $2::timestamptz and estado in ('pendiente','confirmada')`, [profesor, inicio]))[0].n;

const HORAS = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
const DIAS = (dia: string) => HORAS.map((h) => slot(dia, h));

describe('CA-17 / RES-01 dos solicitudes simultáneas por el mismo hueco', () => {
  it('CA-17_T-RES-01_en_20_repeticiones_con_huecos_distintos_exactamente_una_queda_pendiente_y_la_otra_recibe_HUECO_NO_LIBRE', async () => {
    const huecos = [...DIAS('2026-11-04'), ...DIAS('2026-11-05'), slot('2026-11-06', '08:00'), slot('2026-11-06', '09:00')];
    expect(huecos).toHaveLength(20);
    const resultados: { inicio: string; estados: number[] }[] = [];
    for (const inicio of huecos) {
      const [r1, r2] = await Promise.all([pedir('alumno', ids.PA, inicio), pedir('dosVinculos', ids.PA, inicio)]);
      const perdedora = [r1, r2].find((r) => r.status !== 200)!;
      expect([r1.status, r2.status].sort(), `${inicio}: ${JSON.stringify([r1.cuerpo, r2.cuerpo])}`).toEqual([200, 409]);
      expect(mensaje(perdedora)).toBe('HUECO_NO_LIBRE');
      expect(await clasesEn(ids.PA, inicio), inicio).toBe(1);
      const [s] = await sql<{ n: number }>(
        `select count(*)::int as n from public.solicitud where profesor_id = $1 and fecha_clase = $2::timestamptz and estado = 'pendiente'`, [ids.PA, inicio]);
      expect(s.n, `${inicio}: una sola solicitud pendiente`).toBe(1);
      resultados.push({ inicio, estados: [r1.status, r2.status] });
      await limpiarB06(); // mantiene a cada persona por debajo del tope de pendientes (SOL-10)
    }
    registrar('CA-17_T-RES-01', { repeticiones: 20, personas: ['alumno', 'dosVinculos'] }, resultados);
  });

  it('CA-17_T-RES-02_dos_conexiones_con_transacciones_solapadas_la_exclusion_deja_una_sola_fila_y_la_segunda_recibe_23P01', async () => {
    const [aA, aD] = [await alumnoDe('alumno'), await alumnoDe('dosVinculos')];
    const reservas: string[] = [];
    for (const al of [aA, aD]) {
      const [r] = await sql<{ id: string }>(
        `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, hasta, origen)
         values ($1, $2, 'suelta', '10:00', 3, 60, 'pendiente', '2026-11-04', '2026-11-04', 'solicitud') returning id`, [ids.PA, al]);
      reservas.push(r.id);
    }
    const insertar = `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
                      values ($1, $2, $3, '2026-11-04T10:00:00-03:00', '2026-11-04T11:00:00-03:00', 'pendiente')`;
    const c1 = new pg.Client({ connectionString: entorno().dbUrl });
    const c2 = new pg.Client({ connectionString: entorno().dbUrl });
    await Promise.all([c1.connect(), c2.connect()]);
    try {
      await c1.query('begin');
      await c2.query('begin');
      await c1.query(insertar, [ids.PA, reservas[0], aA]);
      const segunda = c2.query(insertar, [ids.PA, reservas[1], aD]).then(
        () => ({ ok: true as const }),
        (e: { code?: string }) => ({ ok: false as const, code: e.code }),
      );
      // La segunda queda esperando la fila sin confirmar de la primera: se confirma y recién entonces se resuelve.
      await new Promise((res) => setTimeout(res, 500));
      await c1.query('commit');
      const r2 = await segunda;
      await c2.query('rollback');
      registrar('CA-17_T-RES-02', { huecos: '2026-11-04 10:00', conexiones: 2 }, { primera: 'commit', segunda: r2 });
      expect(r2).toEqual({ ok: false, code: '23P01' });
      expect(await clasesEn(ids.PA, '2026-11-04T10:00:00-03:00')).toBe(1);
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  it('CA-17_T-RES-03_al_rechazarse_la_solicitud_el_hueco_se_libera_y_otra_persona_lo_pide_(rechazo_simulado_por_SQL,_es_de_B07)', async () => {
    const hueco = slot('2026-11-04', '10:00');
    const a = await pedir('alumno', ids.PA, hueco);
    expect(a.status).toBe(200);
    expect((await pedir('dosVinculos', ids.PA, hueco)).status).toBe(409);
    const { solicitud_id, reserva_id } = a.cuerpo as { solicitud_id: string; reserva_id: string };
    await sql(`update public.solicitud set estado = 'rechazada', respondida_en = public.app_ahora() where id = $1`, [solicitud_id]);
    await sql(`update public.reserva set estado = 'rechazada' where id = $1`, [reserva_id]);
    await sql(`update public.clase set estado = 'rechazada' where reserva_id = $1`, [reserva_id]);
    expect(await estadoHueco(SLUG_A, '2026-11-04', '10:00')).toBe('libre');
    const b = await pedir('dosVinculos', ids.PA, hueco);
    registrar('CA-17_T-RES-03', { hueco }, { primera: a.status, tras_rechazar: b.status });
    expect(b.status, JSON.stringify(b.cuerpo)).toBe(200);
    expect(await clasesEn(ids.PA, hueco)).toBe(1);
  });
});

describe('SOL-10 / SEC-10 tope de 10 pendientes por profesor (CA-41, CA-60)', () => {
  const diez = [slot('2026-11-03', '12:00'), ...DIAS('2026-11-04')];

  async function llenar(): Promise<void> {
    for (const inicio of diez) {
      const r = await pedir('alumno', ids.PA, inicio);
      expect(r.status, `${inicio}: ${JSON.stringify(r.cuerpo)}`).toBe(200);
    }
  }

  it('CA-41_diez_pasan_la_undecima_da_429_LIMITE_EXCEDIDO_sin_clases_y_con_el_hueco_libre_y_con_B_si_se_puede_pedir_(CA-60)', async () => {
    await llenar();
    const [t] = await sql<{ n: number }>('select privado.contar_pendientes($1, $2) as n', [await alumnoDe('alumno'), ids.PA]);
    expect(t.n).toBe(10);
    const undecima = slot('2026-11-05', '09:00');
    const r = await pedir('alumno', ids.PA, undecima);
    registrar('CA-41', { pendientes_con_A: 10, undecima }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(429);
    expect(mensaje(r)).toBe('LIMITE_EXCEDIDO');
    expect(detalle(r)).toEqual({ tope: 'pendientes', limite: 10 });
    expect(await clasesEn(ids.PA, undecima)).toBe(0);
    expect(await estadoHueco(SLUG_A, '2026-11-05', '09:00')).toBe('libre');
    // CA-60 rama de pendientes: 10 con A no impiden pedir con B (la persona está aprobada con ambos).
    await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, $2, 'aprobado', now())`, [await alumnoDe('alumno'), ids.PB]);
    const b = await pedir('alumno', ids.PB, undecima);
    expect(b.status, JSON.stringify(b.cuerpo)).toBe(200);
    expect(await estadoHueco(SLUG_B, '2026-11-05', '09:00')).toBe('ocupado');
    expect(await estadoHueco(SLUG_A, '2026-11-05', '09:00')).toBe('libre');
  });

  it('CA-41_una_pendiente_vencida_no_cuenta_con_reloj_fijo_y_la_decima_nueva_se_acepta', async () => {
    await llenar();
    await fijarReloj('2026-11-03T16:30:00Z'); // martes 13:30: la del martes 12:00 ya pasó, las demás no
    const [t] = await sql<{ n: number }>('select privado.contar_pendientes($1, $2) as n', [await alumnoDe('alumno'), ids.PA]);
    expect(t.n).toBe(9);
    const ok = await pedir('alumno', ids.PA, slot('2026-11-06', '10:00'));
    expect(ok.status, JSON.stringify(ok.cuerpo)).toBe(200);
    const otra = await pedir('alumno', ids.PA, slot('2026-11-06', '11:00'));
    registrar('CA-41_vencida', { reloj: '2026-11-03T16:30Z', vigentes: 9 }, { decima: ok.status, siguiente: [otra.status, mensaje(otra)] });
    expect([otra.status, mensaje(otra)]).toEqual([429, 'LIMITE_EXCEDIDO']);
  });

  it('CA-41_tras_responder_el_profesor_una_de_las_diez_puede_pedir_la_siguiente_(respuesta_simulada_por_SQL,_es_de_B07)', async () => {
    await llenar();
    const undecima = slot('2026-11-05', '09:00');
    expect((await pedir('alumno', ids.PA, undecima)).status).toBe(429);
    await sql(`update public.solicitud set estado = 'confirmada', respondida_en = public.app_ahora() where alumno_id = $1 and fecha_clase = $2::timestamptz`, [
      await alumnoDe('alumno'),
      slot('2026-11-04', '08:00'),
    ]);
    const r = await pedir('alumno', ids.PA, undecima);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect((await pedir('alumno', ids.PA, slot('2026-11-05', '10:00'))).status).toBe(429);
  });

  it('CA-60_el_tope_es_por_profesor_las_pendientes_con_B_no_cuentan_para_A', async () => {
    const a = await alumnoDe('alumnoB');
    for (const inicio of DIAS('2026-11-04')) expect((await pedir('alumnoB', ids.PB, inicio)).status).toBe(200);
    expect((await pedir('alumnoB', ids.PB, slot('2026-11-05', '08:00'))).status).toBe(200);
    expect((await pedir('alumnoB', ids.PB, slot('2026-11-05', '09:00'))).status).toBe(429);
    const [t] = await sql<{ a: number; b: number }>(
      'select privado.contar_pendientes($1, $2) as a, privado.contar_pendientes($1, $3) as b', [a, ids.PA, ids.PB]);
    expect(t).toEqual({ a: 0, b: 10 });
  });
});
