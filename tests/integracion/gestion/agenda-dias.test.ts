// B16 · T16.2 · `agenda_profesor_dias(p_desde, p_hasta)` por la API real (PostgREST local, como la usa la web) con dos profesores.
// Casos del plan: T-CA-72-01 (CA-72, CAL-07), T-CA-73-01 (CA-73, CAL-09), T-CA-85-01 (CA-85, INV-02); INV-03, INV-05, SEC-34, CAL-08.
// El rendimiento de la llamada de 7 días solo se registra (diferido a B23): test-results/evidencia-gestion.jsonl, caso `B16_duracion_7_dias`.
// Reloj fijo (ADR-014): lunes 2026-11-02 12:00 de Montevideo. Datos sintéticos «T16 …» (@example.test), huecos de 30 min; se limpian al terminar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj, limpiarReloj } from '../../soporte/reloj';
import { rpc, sesionDe, type Rol } from '../../soporte/usuarios';
import { restaurarConfiguracion } from '../reservas/ayuda';
import { AHORA, asegurarSesionProfesor, idsProfesores, registrar, type Ids } from './ayuda';

const PREFIJO = 'T16 ';
const COLUMNAS = [
  'bloqueo_id', 'bloqueo_motivo', 'clase_estado', 'clase_fin', 'clase_id', 'clase_inicio', 'dia', 'estado', 'fin', 'inicio', 'observacion',
  'pasada', 'quien_toma', 'reserva_tipo', 'solicitud_id', 'solicitud_tipo', 'titular',
];
interface Fila {
  inicio: string;
  fin: string;
  estado: string;
  clase_id: string | null;
  solicitud_id: string | null;
  quien_toma: string | null;
  titular: string | null;
  clase_estado: string | null;
  bloqueo_id: string | null;
  bloqueo_motivo: string | null;
  dia: string;
  clase_inicio: string | null;
  clase_fin: string | null;
  solicitud_tipo: string | null;
}
const D = { desde: '2026-11-02', hasta: '2026-11-08' };

let ids: Ids;
const k: Record<string, string> = {};

async function persona(clave: string, nombre: string, prof: string, n: number): Promise<string> {
  const [a] = await sql<{ id: string }>(
    `insert into public.alumno (estado, nombre, telefono, fecha_nacimiento, mail, ficha_completada_en)
     values ('completa', $1, $2, '1990-01-01', $3, '2026-01-01T12:00:00Z') returning id`,
    [PREFIJO + nombre, `+598 9916100${n}`, `t16.p${n}@example.test`],
  );
  await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado, aprobado_en) values ($1, $2, 'aprobado', '2026-01-01')`, [a.id, prof]);
  k[clave] = a.id;
  return a.id;
}
/** Reserva suelta y su clase de `min` minutos; guarda en `k` la clase (`<clave>_c`) y la reserva (`<clave>_r`). */
async function clase(clave: string, prof: string, alumno: string, inicio: string, min: number, estado = 'confirmada', estadoReserva = 'confirmada'): Promise<void> {
  const [r] = await sql<{ id: string }>(
    `insert into public.reserva (profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, estado, desde, origen)
     select $1, $2, 'suelta', l::time, extract(isodow from l), $4::int, $5, l::date, 'profesor'
       from (select $3::timestamptz at time zone 'America/Montevideo' as l) x returning id`,
    [prof, alumno, inicio, min, estadoReserva],
  );
  const [c] = await sql<{ id: string }>(
    `insert into public.clase (profesor_id, reserva_id, alumno_id, inicio, fin, estado)
     values ($1, $2, $3, $4::timestamptz, $4::timestamptz + make_interval(mins => $5::int), $6) returning id`,
    [prof, r.id, alumno, inicio, min, estado],
  );
  k[`${clave}_c`] = c.id;
  k[`${clave}_r`] = r.id;
}
async function solicitud(clave: string, prof: string, alumno: string, tipo: string, fecha: string, estado: string, reserva: string | null, claseId: string | null): Promise<void> {
  const [s] = await sql<{ id: string }>(
    `insert into public.solicitud (profesor_id, alumno_id, tipo, alcance, reserva_id, clase_id, fecha_clase, estado)
     values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8) returning id`,
    [prof, alumno, tipo, tipo === 'reserva' ? null : 'solo_esta', reserva, claseId, fecha, estado],
  );
  k[clave] = s.id;
}
async function limpiar(): Promise<void> {
  const ALUMNOS = `select id from public.alumno where nombre like '${PREFIJO}%'`;
  await sql(`delete from public.solicitud where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.clase where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.reserva where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.bloqueo where motivo like '${PREFIJO}%'`);
  await sql(`delete from public.inscripcion where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.mail_salida where alumno_id in (${ALUMNOS})`);
  await sql(`delete from public.alumno where nombre like '${PREFIJO}%'`);
}
async function dias(rol: Rol, desde = D.desde, hasta = D.hasta) {
  const r = await rpc(rol, 'agenda_profesor_dias', { p_desde: desde, p_hasta: hasta });
  expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
  return r.cuerpo as Fila[];
}
const de = (filas: Fila[], clave: string) => filas.filter((f) => f.clase_id === k[`${clave}_c`]);

beforeAll(async () => {
  await asegurarSesionProfesor();
  await sesionDe('profesor');
  await sesionDe('profesorB');
  ids = await idsProfesores();
  await limpiar();
  await restaurarConfiguracion();
  await fijarReloj(AHORA);
  await sql('update public.profesor set duracion_min = 30 where id in ($1, $2)', [ids.PA, ids.PB]);

  const ana = await persona('ana', 'Ana', ids.PA, 1);
  const bea = await persona('bea', 'Bea', ids.PA, 2);
  const cris = await persona('cris', 'Cris', ids.PA, 3);
  const dani = await persona('dani', 'Dani', ids.PA, 4);
  const eli = await persona('eli', 'Eli', ids.PA, 5);
  const fede = await persona('fede', 'Fede', ids.PA, 6);
  const bruno = await persona('bruno', 'Bruno de B', ids.PB, 7);
  // A: clase de 60 min sobre huecos de 30 (lunes 10:00), clase de 30 con cancelación pendiente (lunes 14:00), clase cancelada (martes 10:00),
  // cancelación rechazada (martes 11:00), reserva rechazada con su clase (martes 14:00), clase de 30 (miércoles 09:00), clase pendiente de una
  // reserva (jueves 10:00) y un movimiento pendiente: origen confirmado (viernes 09:00) y destino pendiente (viernes 11:00).
  await clase('c60', ids.PA, ana, '2026-11-02 10:00-03', 60);
  await clase('ccan', ids.PA, fede, '2026-11-02 14:00-03', 30);
  await clase('xcan', ids.PA, bea, '2026-11-03 10:00-03', 30, 'cancelada', 'cancelada');
  await clase('xrech', ids.PA, bea, '2026-11-03 11:00-03', 30);
  await clase('rrech', ids.PA, eli, '2026-11-03 14:00-03', 30, 'rechazada', 'rechazada');
  await clase('c30', ids.PA, cris, '2026-11-04 09:00-03', 30);
  await clase('res', ids.PA, dani, '2026-11-05 10:00-03', 30, 'pendiente', 'pendiente');
  await clase('mo', ids.PA, eli, '2026-11-06 09:00-03', 30);
  await clase('md', ids.PA, eli, '2026-11-06 11:00-03', 30, 'pendiente', 'pendiente');
  await solicitud('s_res', ids.PA, dani, 'reserva', '2026-11-05 10:00-03', 'pendiente', k.res_r, null);
  await solicitud('s_mov', ids.PA, eli, 'movimiento', '2026-11-06 09:00-03', 'pendiente', k.md_r, k.mo_c);
  await solicitud('s_can', ids.PA, fede, 'cancelacion', '2026-11-02 14:00-03', 'pendiente', null, k.ccan_c);
  await solicitud('s_rech1', ids.PA, bea, 'cancelacion', '2026-11-03 11:00-03', 'rechazada', null, k.xrech_c);
  await solicitud('s_rech2', ids.PA, eli, 'reserva', '2026-11-03 14:00-03', 'rechazada', k.rrech_r, null);
  await sql(`insert into public.bloqueo (profesor_id, periodo, motivo) values ($1, tstzrange('2026-11-04 15:00-03', '2026-11-04 16:00-03', '[)'), $2)`, [ids.PA, `${PREFIJO}Bloqueo de A`]);
  // B: en los mismos horarios que A (lunes 10:00-11:00, miércoles 09:00 con cancelación pendiente) y un bloqueo propio.
  await clase('b60', ids.PB, bruno, '2026-11-02 10:00-03', 60);
  await clase('b30', ids.PB, bruno, '2026-11-04 09:00-03', 30);
  await solicitud('s_b', ids.PB, bruno, 'cancelacion', '2026-11-04 09:00-03', 'pendiente', null, k.b30_c);
  await sql(`insert into public.bloqueo (profesor_id, periodo, motivo) values ($1, tstzrange('2026-11-04 15:00-03', '2026-11-04 16:00-03', '[)'), $2)`, [ids.PB, `${PREFIJO}Bloqueo de B`]);
}, 300_000);
afterAll(async () => {
  await limpiar();
  await restaurarConfiguracion();
  await limpiarReloj();
  await cerrar();
});

describe('INV-02 / CA-85 aislamiento entre profesores', () => {
  it('T-CA-85-01_INV-02_A_lee_7_dias_con_su_sesion_y_no_ve_nada_de_B', async () => {
    const a = await dias('profesor');
    registrar('T-CA-85-01_A', { rol: 'profesor', ...D }, { filas: a.length, claseIds: a.map((f) => f.clase_id).filter(Boolean).length });
    expect(a.length).toBeGreaterThan(0);
    const deB = new Set([k.b60_c, k.b30_c]);
    expect(a.filter((f) => (f.clase_id && deB.has(f.clase_id)) || f.solicitud_id === k.s_b), 'filas de B en la lectura de A').toEqual([]);
    expect(JSON.stringify(a)).not.toMatch(/Bruno|Bloqueo de B/);
    expect(de(a, 'c60').length).toBe(2);
  });
  it('T-CA-85-01_INV-02_B_lee_7_dias_con_su_sesion_y_no_ve_nada_de_A', async () => {
    const b = await dias('profesorB');
    registrar('T-CA-85-01_B', { rol: 'profesorB', ...D }, { filas: b.length });
    expect(b.length).toBeGreaterThan(0);
    const deA = Object.entries(k).filter(([c]) => c.endsWith('_c') && !c.startsWith('b')).map(([, v]) => v);
    expect(b.filter((f) => f.clase_id && deA.includes(f.clase_id)), 'clases de A en la lectura de B').toEqual([]);
    expect(b.filter((f) => f.solicitud_id && f.solicitud_id !== k.s_b)).toEqual([]);
    expect(JSON.stringify(b)).not.toMatch(/Ana|Bea|Cris|Dani|Eli|Fede|Bloqueo de A/);
    expect(de(b, 'b60').length).toBe(2);
    expect(de(b, 'b30')[0].solicitud_tipo).toBe('cancelacion');
  });
  it('CA-85_los_parametros_no_eligen_al_profesor_solo_p_desde_y_p_hasta', async () => {
    const r = await rpc('profesor', 'agenda_profesor_dias', { ...{ p_desde: D.desde, p_hasta: D.hasta }, p_profesor: ids.PB });
    registrar('CA-85_p_profesor_extra', { p_desde: D.desde, p_hasta: D.hasta, p_profesor: ids.PB }, { status: r.status });
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('INV-05 profesor inactivo', () => {
  it('INV-05_el_profesor_inactivo_lee_lo_suyo', async () => {
    const antes = await dias('profesor');
    try {
      await sql('update public.profesor set activo = false where id = $1', [ids.PA]);
      const inactivo = await dias('profesor');
      registrar('INV-05_inactivo', { rol: 'profesor', ...D }, { filas: inactivo.length });
      expect(inactivo).toEqual(antes);
    } finally {
      await sql('update public.profesor set activo = true where id = $1', [ids.PA]);
    }
  });
});

describe('CA-72 / CAL-07 duración real de la clase', () => {
  it('T-CA-72-01_clase_de_60_min_sobre_huecos_de_30_trae_clase_inicio_y_clase_fin_reales', async () => {
    const a = await dias('profesor');
    const filas = de(a, 'c60');
    registrar('T-CA-72-01_60', { rol: 'profesor', ...D }, filas);
    expect(filas.map((f) => (Date.parse(f.fin) - Date.parse(f.inicio)) / 60_000)).toEqual([30, 30]);
    for (const f of filas) {
      expect(Date.parse(f.clase_inicio!)).toBe(Date.parse('2026-11-02T10:00:00-03:00'));
      expect(Date.parse(f.clase_fin!)).toBe(Date.parse('2026-11-02T11:00:00-03:00'));
      expect(f.dia).toBe('2026-11-02');
    }
  });
  it('T-CA-72-01_clase_de_30_min_trae_su_duracion_y_un_hueco_libre_no_trae_clase', async () => {
    const a = await dias('profesor');
    const [f] = de(a, 'c30');
    expect((Date.parse(f.clase_fin!) - Date.parse(f.clase_inicio!)) / 60_000).toBe(30);
    expect(a.filter((x) => !x.clase_id && (x.clase_inicio || x.clase_fin || x.solicitud_tipo))).toEqual([]);
  });
  it('T-CA-72-04_CAL-08_movimiento_pendiente_origen_confirmado_y_destino_pendiente_con_el_nombre', async () => {
    const a = await dias('profesor');
    const [origen] = de(a, 'mo');
    const [destino] = de(a, 'md');
    registrar('T-CA-72-04', { rol: 'profesor', ...D }, { origen, destino });
    expect(origen.clase_estado).toBe('confirmada');
    expect(origen.solicitud_tipo).toBe('movimiento');
    expect(destino.clase_estado).toBe('pendiente');
    expect(destino.solicitud_tipo).toBe('movimiento');
    expect(destino.quien_toma).toBe(`${PREFIJO}Eli`);
    expect(origen.solicitud_id).toBe(k.s_mov);
  });
  it('CAL-08_solicitud_tipo_de_reserva_y_de_cancelacion_pendientes', async () => {
    const a = await dias('profesor');
    expect(de(a, 'res')[0].solicitud_tipo).toBe('reserva');
    expect(de(a, 'ccan')[0].solicitud_tipo).toBe('cancelacion');
  });
});

describe('CA-73 / CAL-09 canceladas y rechazadas ausentes', () => {
  it('T-CA-73-01_clase_cancelada_y_solicitudes_rechazadas_no_aparecen_en_7_dias', async () => {
    const a = await dias('profesor');
    registrar('T-CA-73-01', { rol: 'profesor', ...D }, { filas: a.length });
    expect(a.filter((f) => f.clase_id === k.xcan_c || f.clase_id === k.rrech_c)).toEqual([]);
    expect(a.filter((f) => f.solicitud_id === k.s_rech1 || f.solicitud_id === k.s_rech2)).toEqual([]);
    expect(a.filter((f) => f.clase_estado && !['pendiente', 'confirmada'].includes(f.clase_estado))).toEqual([]);
    const [conRechazo] = de(a, 'xrech');
    expect(conRechazo.solicitud_tipo).toBeNull();
  });
});

describe('INV-03 igualdad con agenda_profesor(p_dia)', () => {
  it('INV-03_cada_dia_del_rango_coincide_fila_a_fila_con_agenda_profesor', async () => {
    const a = await dias('profesor');
    const dia = (n: number) => new Date(Date.parse(`${D.desde}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    let total = 0;
    for (let n = 0; n < 7; n++) {
      const r = await rpc('profesor', 'agenda_profesor', { p_dia: dia(n) });
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
      const esperadas = r.cuerpo as Record<string, unknown>[];
      const recibidas = a
        .filter((f) => f.dia === dia(n))
        .map((f) => {
          const { dia: _d, clase_inicio: _ci, clase_fin: _cf, solicitud_tipo: _st, ...resto } = f as unknown as Record<string, unknown>;
          return resto;
        });
      registrar(`INV-03_${dia(n)}`, { p_dia: dia(n) }, { filas: esperadas.length });
      expect(recibidas, dia(n)).toEqual(esperadas);
      total += esperadas.length;
    }
    expect(a.length).toBe(total);
  });
});

describe('SEC-34 columnas', () => {
  it('SEC-34_la_respuesta_trae_exactamente_las_17_columnas_y_ningun_dato_personal', async () => {
    const a = await dias('profesor');
    for (const f of a) expect(Object.keys(f).sort()).toEqual(COLUMNAS);
    expect(JSON.stringify(a)).not.toMatch(/@|\+598|1990-01-01/);
    registrar('SEC-34', { rol: 'profesor', ...D }, { columnas: Object.keys(a[0]).sort() });
  });
});

describe('Rendimiento (solo se registra; diferido a B23)', () => {
  it('B16_duracion_de_la_llamada_de_7_dias_se_registra_y_si_pasa_de_500_ms_es_un_hallazgo', async () => {
    await dias('profesor'); // calentamiento
    const medidas: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await dias('profesor');
      medidas.push(Math.round(performance.now() - t0));
    }
    const mediana = [...medidas].sort((x, y) => x - y)[2];
    registrar('B16_duracion_7_dias', { rol: 'profesor', ...D, repeticiones: 5 }, { ms: medidas, mediana, umbral_ms: 500, supera: mediana > 500 });
    expect(medidas.length).toBe(5);
  });
});
