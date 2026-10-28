// B02 · T02.3 / B14 · T14.5 · agenda pública por slug con dos profesores por la API (PostgREST local): CA-11, CA-51, CA-63, CA-15 (SEC-07, NFR-01), CA-16 (AGE-08),
// límites de p_dia y de la grilla (SEC-09) y acceso a las tablas nuevas (SEC-01, SEC-03).
// Casos: T-AGE-01, T-AGE-02, T-AGE-03, T-AGE-13, T-AGE-14, T-AGE-18. Reloj de la aplicación fijo (ADR-014) en
// lunes 2026-11-02 12:00 de Montevideo. Datos sintéticos; se limpian al terminar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { entorno } from '../../soporte/entorno';
import { fijarReloj, limpiarReloj } from '../../soporte/reloj';
import { profesorId, rest, rpc, sesionDe, SLUG_A, SLUG_B } from '../../soporte/usuarios';

const LUNES = '2026-11-02';
const AHORA = '2026-11-02T15:00:00Z'; // 12:00 en Montevideo (-03)
const PREFIJO_ID = 'f2000000-0000-0000-0000-0000000000';
const id = (n: number) => `${PREFIJO_ID}${String(n).padStart(2, '0')}`;
const CENTINELAS = ['CentinelaNombre', 'CentinelaObservacion', 'CentinelaMotivo', 'CentinelaMail', 'centinela.agenda@example.test'];

interface Hueco {
  inicio: string;
  fin: string;
  estado: string;
}

const hora = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/** Respuesta cruda de anon: texto tal como llega al navegador (SEC-07). */
async function agendaCruda(dia: string, slug: string = SLUG_A): Promise<{ status: number; texto: string }> {
  const e = entorno();
  const r = await fetch(`${e.apiUrl}/rest/v1/rpc/agenda_publica`, {
    method: 'POST',
    headers: { apikey: e.anonKey, Authorization: `Bearer ${e.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_slug: slug, p_dia: dia }),
  });
  return { status: r.status, texto: await r.text() };
}

async function huecos(dia: string, slug: string = SLUG_A): Promise<Hueco[]> {
  const r = await agendaCruda(dia, slug);
  expect(r.status, r.texto).toBe(200);
  return JSON.parse(r.texto) as Hueco[];
}

async function limpiarDatos() {
  await sql('delete from public.clase where id::text like $1', [`${PREFIJO_ID}%`]);
  await sql('delete from public.reserva where id::text like $1', [`${PREFIJO_ID}%`]);
  await sql('delete from public.bloqueo where id::text like $1', [`${PREFIJO_ID}%`]);
  await sql('delete from public.inscripcion where alumno_id::text like $1', [`${PREFIJO_ID}%`]);
  await sql('delete from public.alumno where id::text like $1', [`${PREFIJO_ID}%`]);
}

const TRAMOS_INICIALES = [1, 2, 3, 4, 5].flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);

const DE_A = `(select id from public.profesor where slug = '${SLUG_A}')`;
let PA = '';
let PB = '';

/** Deja a los dos profesores con la configuración y la grilla iniciales (AGE-01); los tests solo tocan a A. */
async function restaurarConfiguracion() {
  await sql("update public.profesor set duracion_min = 60, anticipacion_horas = 24, zona_horaria = 'America/Montevideo', activo = true");
  await sql('delete from public.grilla_tramo');
  await sql(
    `insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta)
     select p.id, (t ->> 'dia_semana')::smallint, (t ->> 'desde')::time, (t ->> 'hasta')::time
       from public.profesor p, jsonb_array_elements($1::jsonb) t`,
    [JSON.stringify(TRAMOS_INICIALES)],
  );
}

beforeAll(async () => {
  await sesionDe('profesor');
  await sesionDe('alumno');
  PA = await profesorId(SLUG_A);
  PB = await profesorId(SLUG_B);
  await limpiarDatos();
  await restaurarConfiguracion();
  await fijarReloj(AHORA);
}, 300_000);

afterAll(async () => {
  await limpiarDatos();
  await restaurarConfiguracion();
  await limpiarReloj();
  await cerrar();
});

describe('CA-11 huecos del día (AGE-01, AGE-02)', () => {
  it('CA-11_T-AGE-01_el_lunes_con_60_min_tiene_9_huecos_de_08_a_13_y_de_14_a_18', async () => {
    const h = await huecos(LUNES);
    expect(h).toHaveLength(9);
    expect(h.map((x) => hora(x.inicio))).toEqual(['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']);
    expect(hora(h[h.length - 1].fin)).toBe('18:00');
    expect(h.every((x) => x.estado === 'libre')).toBe(true);
    expect(h.some((x) => hora(x.inicio) === '13:00')).toBe(false);
  });

  it('CA-11_T-AGE-02_con_90_min_la_manana_genera_3_huecos_y_el_sobrante_no_es_hueco', async () => {
    await sql(`update public.profesor set duracion_min = 90 where id = ${DE_A}`);
    try {
      const h = await huecos(LUNES);
      const manana = h.filter((x) => Date.parse(x.inicio) < Date.parse('2026-11-02T16:00:00Z')).map((x) => hora(x.inicio));
      expect(manana).toEqual(['08:00', '09:30', '11:00']);
      expect(h).toHaveLength(5);
    } finally {
      await sql('update public.profesor set duracion_min = 60');
    }
  });

  it('CA-11_T-AGE-03_un_domingo_sin_grilla_devuelve_lista_vacia', async () => {
    expect(await huecos('2026-11-01')).toEqual([]);
  });
});

describe('CA-16 huso del profesor (AGE-08) · T-AGE-18', () => {
  it('CA-16_los_instantes_salen_en_el_huso_configurado_y_cambian_si_cambia_el_huso', async () => {
    const [montevideo] = await huecos(LUNES);
    expect(Date.parse(montevideo.inicio)).toBe(Date.parse('2026-11-02T11:00:00Z')); // 08:00 -03
    await sql(`update public.profesor set zona_horaria = 'Asia/Tokyo' where id = ${DE_A}`);
    try {
      const [tokio] = await huecos(LUNES);
      expect(Date.parse(tokio.inicio)).toBe(Date.parse('2026-11-01T23:00:00Z')); // 08:00 +09
    } finally {
      await sql("update public.profesor set zona_horaria = 'America/Montevideo'");
    }
  });
});

describe('CA-15 respuesta cruda de anon sin datos personales (SEC-07, NFR-01) · T-AGE-13', () => {
  beforeAll(async () => {
    const profesor = PA;
    await sql(
      `insert into public.alumno (id, estado, nombre, mail, telefono, fecha_nacimiento, ficha_completada_en, creado_por)
       values ($1, 'completa', 'CentinelaNombre', 'centinela.agenda@example.test', '+598 99 111 222', '1990-01-01', now(), $3),
              ($2, 'completa', 'CentinelaMail', 'centinela.agenda2@example.test', '+598 99 333 444', '1990-01-01', now(), $3)`,
      [id(1), id(2), profesor],
    );
    await sql(`insert into public.inscripcion (alumno_id, profesor_id, estado) values ($1, $3, 'sin_cuenta'), ($2, $3, 'sin_cuenta')`, [id(1), id(2), profesor]);
    await sql(
      `insert into public.reserva (id, profesor_id, alumno_id, tipo, hora_local, dia_semana, duracion_min, observacion, estado, desde, origen)
       values ($1, $3, $4, 'suelta', '09:00', 1, 60, 'CentinelaObservacion', 'confirmada', '2026-11-02', 'solicitud'),
              ($2, $3, $5, 'suelta', '10:00', 1, 60, 'CentinelaObservacion', 'pendiente', '2026-11-02', 'solicitud')`,
      [id(3), id(4), profesor, id(1), id(2)],
    );
    await sql(
      `insert into public.clase (id, profesor_id, reserva_id, alumno_id, inicio, fin, estado) values
         ($1, $3, $4, $5, '2026-11-02 09:00-03', '2026-11-02 10:00-03', 'confirmada'),
         ($2, $3, $6, $7, '2026-11-02 10:00-03', '2026-11-02 11:00-03', 'pendiente')`,
      [id(5), id(6), profesor, id(3), id(1), id(4), id(2)],
    );
    await sql(
      `insert into public.bloqueo (id, profesor_id, periodo, motivo)
       values ($1, $2, tstzrange('2026-11-02 14:00-03', '2026-11-02 16:00-03', '[)'), 'CentinelaMotivo')`,
      [id(7), profesor],
    );
  });

  it('CA-15_el_cuerpo_crudo_no_contiene_nombres_observaciones_motivos_ni_mails', async () => {
    const { status, texto } = await agendaCruda(LUNES);
    expect(status, texto).toBe(200);
    for (const c of CENTINELAS) expect(texto.toLowerCase(), `centinela ${c} en el cuerpo`).not.toContain(c.toLowerCase());
    expect(texto).not.toMatch(/example\.test|\+598|alumno|motivo|observaci/i);
    expect(texto).not.toContain(PREFIJO_ID);
  });

  it('CA-15_SEC-07_cada_elemento_tiene_solo_inicio_fin_y_estado', async () => {
    const h = JSON.parse((await agendaCruda(LUNES)).texto) as Record<string, unknown>[];
    expect(h.length).toBeGreaterThan(0);
    for (const x of h) expect(Object.keys(x).sort()).toEqual(['estado', 'fin', 'inicio']);
  });

  it('CA-15_el_hueco_con_solicitud_pendiente_figura_ocupado_y_el_bloqueo_como_bloqueado', async () => {
    const porHora = Object.fromEntries((await huecos(LUNES)).map((x) => [hora(x.inicio), x.estado]));
    expect(porHora['09:00']).toBe('ocupado'); // clase confirmada
    expect(porHora['10:00']).toBe('ocupado'); // solicitud pendiente
    expect(porHora['11:00']).toBe('libre');
    expect(porHora['14:00']).toBe('bloqueado');
    expect(porHora['15:00']).toBe('bloqueado');
    expect(porHora['16:00']).toBe('libre');
  });

  it('CA-15_el_resultado_es_el_mismo_para_un_alumno_autenticado_que_para_anon', async () => {
    const anon = await rpc('anon', 'agenda_publica', { p_slug: SLUG_A, p_dia: LUNES });
    const alumno = await rpc('alumno', 'agenda_publica', { p_slug: SLUG_A, p_dia: LUNES });
    expect(alumno.status).toBe(200);
    expect(alumno.cuerpo).toEqual(anon.cuerpo);
  });
});

describe('SEC-09 límites de p_dia', () => {
  const dias = (n: number) => new Date(Date.parse(`${LUNES}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const MAX = 26 * 7 + 31;

  it('SEC-09_los_extremos_del_rango_se_aceptan', async () => {
    expect((await agendaCruda(dias(-366))).status).toBe(200);
    expect((await agendaCruda(dias(MAX))).status).toBe(200);
  });

  it('SEC-09_un_dia_fuera_del_rango_da_422_DATOS_INVALIDOS_con_el_campo', async () => {
    for (const dia of [dias(-367), dias(MAX + 1), '1900-01-01', '2999-12-31']) {
      const r = await agendaCruda(dia);
      expect(r.status, `${dia}: ${r.texto}`).toBe(422);
      const cuerpo = JSON.parse(r.texto) as { message: string; details: string };
      expect(cuerpo.message).toBe('DATOS_INVALIDOS');
      expect(JSON.parse(cuerpo.details)).toEqual({ campo: 'p_dia' });
    }
  });

  it('SEC-09_p_dia_nulo_o_con_formato_invalido_no_devuelve_200', async () => {
    const e = entorno();
    for (const cuerpo of [{ p_slug: SLUG_A, p_dia: null }, { p_slug: SLUG_A, p_dia: '2026-13-45' }, { p_slug: SLUG_A, p_dia: 'no-es-fecha' }, { p_slug: SLUG_A }]) {
      const r = await fetch(`${e.apiUrl}/rest/v1/rpc/agenda_publica`, {
        method: 'POST',
        headers: { apikey: e.anonKey, Authorization: `Bearer ${e.anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const texto = await r.text();
      expect([400, 404, 422], `${JSON.stringify(cuerpo)}: ${r.status} ${texto}`).toContain(r.status);
    }
  });
});

describe('SEC-09 límite de la grilla (guardar_grilla)', () => {
  const tramos = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      dia_semana: Math.floor(i / 8) + 1,
      desde: `${String((i % 8) * 3).padStart(2, '0')}:00`,
      hasta: `${String((i % 8) * 3 + 1).padStart(2, '0')}:00`,
    }));

  it('SEC-09_una_grilla_de_51_tramos_da_422_y_no_cambia_la_grilla', async () => {
    const antes = await sql('select count(*)::int n from public.grilla_tramo');
    const r = await rpc('profesor', 'guardar_grilla', { p_tramos: tramos(51) });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(422);
    const c = r.cuerpo as { message: string; details: string };
    expect(c.message).toBe('DATOS_INVALIDOS');
    expect(JSON.parse(c.details)).toEqual({ campo: 'p_tramos' });
    expect(await sql('select count(*)::int n from public.grilla_tramo')).toEqual(antes);
  });

  it('SEC-09_una_grilla_de_50_tramos_se_acepta_y_la_agenda_la_refleja', async () => {
    try {
      const r = await rpc('profesor', 'guardar_grilla', { p_tramos: tramos(50) });
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
      expect(r.cuerpo as unknown[]).toHaveLength(50);
      // Martes: 8 tramos de 1 hora cada 3 horas, empezando a las 00:00 (sin clases ese día).
      expect(await huecos('2026-11-03')).toHaveLength(8);
    } finally {
      await restaurarConfiguracion();
    }
  });

  it('SEC-09_tramos_con_formato_invalido_o_solapados_dan_422', async () => {
    for (const p_tramos of [
      [{ dia_semana: 8, desde: '08:00', hasta: '09:00' }],
      [{ dia_semana: 1, desde: '8:00', hasta: '09:00' }],
      [{ dia_semana: 1, desde: '09:00', hasta: '09:00' }],
      [
        { dia_semana: 1, desde: '10:00', hasta: '12:00' },
        { dia_semana: 1, desde: '11:00', hasta: '13:00' },
      ],
    ]) {
      const r = await rpc('profesor', 'guardar_grilla', { p_tramos });
      expect(r.status, `${JSON.stringify(p_tramos)}: ${JSON.stringify(r.cuerpo)}`).toBe(422);
    }
  });

  it('SEC-09_la_configuracion_con_duracion_o_huso_invalidos_da_422', async () => {
    for (const args of [
      { p_duracion_min: 0, p_anticipacion_horas: 24, p_zona_horaria: 'America/Montevideo' },
      { p_duracion_min: 60, p_anticipacion_horas: -1, p_zona_horaria: 'America/Montevideo' },
      { p_duracion_min: 60, p_anticipacion_horas: 24, p_zona_horaria: 'Mars/Olympus' },
    ]) {
      const r = await rpc('profesor', 'guardar_configuracion', args);
      expect(r.status, `${JSON.stringify(args)}: ${JSON.stringify(r.cuerpo)}`).toBe(422);
    }
    const d = await sql<{ duracion_min: number }>('select duracion_min from public.profesor');
    expect(d.map((x) => x.duracion_min)).toEqual([60, 60]);
  });
});

describe('SEC-01 / SEC-02 / SEC-03 tablas nuevas por la API · T-AGE-14', () => {
  const TABLAS = ['grilla_tramo', 'bloqueo', 'reserva', 'clase'];
  const CAMBIO: Record<string, object> = { grilla_tramo: { desde: '00:00' }, bloqueo: { motivo: 'x' }, reserva: { estado: 'cancelada' }, clase: { estado: 'cancelada' } };

  it('SEC-01_anon_no_lee_ninguna_tabla_de_agenda', async () => {
    for (const t of TABLAS) {
      const r = await rest('anon', 'GET', `${t}?select=*`);
      expect([401, 403], `${t}: ${r.status} ${JSON.stringify(r.cuerpo)}`).toContain(r.status);
    }
  });

  it('SEC-02_el_alumno_no_ve_grilla_ni_bloqueos_y_solo_ve_filas_propias_de_clase_y_reserva', async () => {
    const { alumnoId } = await sesionDe('alumno');
    for (const t of ['grilla_tramo', 'bloqueo']) {
      const r = await rest('alumno', 'GET', `${t}?select=id`);
      expect(r.status).toBe(200);
      expect(r.cuerpo, `${t} visible para el alumno`).toEqual([]);
    }
    for (const t of ['clase', 'reserva']) {
      const r = await rest('alumno', 'GET', `${t}?select=alumno_id`);
      expect(r.status).toBe(200);
      for (const f of r.cuerpo as { alumno_id: string }[]) expect(f.alumno_id).toBe(alumnoId);
    }
  });

  it('SEC-02_el_profesor_lee_la_grilla_y_los_bloqueos', async () => {
    const g = await rest('profesor', 'GET', 'grilla_tramo?select=id,profesor_id');
    expect(g.status).toBe(200);
    expect((g.cuerpo as unknown[]).length).toBeGreaterThan(0);
    expect((g.cuerpo as { profesor_id: string }[]).every((f) => f.profesor_id === PA), 'solo la grilla propia (CA-51)').toBe(true);
    const b = await rest('profesor', 'GET', 'bloqueo?select=id,profesor_id');
    expect(b.status).toBe(200);
    expect((b.cuerpo as unknown[]).length).toBeGreaterThan(0);
    expect((b.cuerpo as { profesor_id: string }[]).every((f) => f.profesor_id === PA)).toBe(true);
  });

  it('SEC-03_la_escritura_directa_en_las_tablas_de_agenda_falla_para_alumno_y_profesor', async () => {
    for (const rol of ['anon', 'alumno', 'profesor', 'profesorB', 'administrador'] as const) {
      for (const t of TABLAS) {
        for (const [metodo, ruta, cuerpo] of [
          ['POST', t, {}],
          ['PATCH', `${t}?id=not.is.null`, CAMBIO[t]],
          ['DELETE', `${t}?id=not.is.null`, undefined],
        ] as const) {
          const r = await rest(rol, metodo, ruta, cuerpo);
          expect([401, 403], `${rol} ${metodo} ${t}: ${r.status}`).toContain(r.status);
        }
      }
    }
    const [{ n }] = await sql<{ n: string }>("select count(*)::text n from public.clase where estado = 'cancelada' and id::text like $1", [`${PREFIJO_ID}%`]);
    expect(n).toBe('0');
  });
});

describe('CA-51 / CA-63 agenda por slug con dos profesores', () => {
  it('CA-51_la_agenda_de_B_no_trae_la_clase_ni_el_bloqueo_de_A_y_cada_slug_da_su_agenda', async () => {
    // La clase y el bloqueo de A (sembrados arriba) no aparecen en la agenda de B; B tiene la grilla inicial entera.
    const a = Object.fromEntries((await huecos(LUNES, SLUG_A)).map((x) => [hora(x.inicio), x.estado]));
    const b = Object.fromEntries((await huecos(LUNES, SLUG_B)).map((x) => [hora(x.inicio), x.estado]));
    expect(a['09:00']).toBe('ocupado');
    expect(a['14:00']).toBe('bloqueado');
    expect(Object.values(b)).toHaveLength(9);
    expect(Object.values(b).every((e) => e === 'libre')).toBe(true);
  });

  it('CA-51_la_configuracion_de_A_no_cambia_la_agenda_de_B', async () => {
    await sql(`update public.profesor set duracion_min = 90 where id = ${DE_A}`);
    try {
      expect(await huecos(LUNES, SLUG_B)).toHaveLength(9);
      expect(await huecos(LUNES, SLUG_A)).toHaveLength(5);
    } finally {
      await sql('update public.profesor set duracion_min = 60');
    }
  });

  it('CA-63_el_slug_se_compara_sin_distinguir_mayusculas_ni_espacios_en_los_bordes', async () => {
    expect(await huecos(LUNES, '  PROFESOR-PRUEBA ')).toEqual(await huecos(LUNES, SLUG_A));
  });

  it('CA-63_un_slug_inexistente_da_404_NO_ENCONTRADO_igual_para_agenda_y_configuracion', async () => {
    const r = await agendaCruda(LUNES, 'no-existe');
    expect(r.status).toBe(404);
    expect((JSON.parse(r.texto) as { message: string }).message).toBe('NO_ENCONTRADO');
    const c = await rpc('anon', 'config_publica', { p_slug: 'no-existe' });
    expect(c.status).toBe(404);
    expect((c.cuerpo as { message: string }).message).toBe('NO_ENCONTRADO');
  });

  it('CA-63_config_publica_de_cada_slug_trae_la_configuracion_de_ese_profesor_y_solo_las_claves_del_contrato', async () => {
    const a = await rpc('anon', 'config_publica', { p_slug: SLUG_A });
    expect(a.status).toBe(200);
    const o = a.cuerpo as Record<string, unknown>;
    expect(Object.keys(o).sort()).toEqual(['activo', 'anticipacion_horas', 'duracion_min', 'horizonte_semanas', 'nombre', 'profesor_id', 'zona_horaria']);
    expect(o.nombre).toBe('Profesor de Prueba');
    expect(o.profesor_id).toBe(PA);
    const b = (await rpc('anon', 'config_publica', { p_slug: SLUG_B })).cuerpo as Record<string, unknown>;
    expect(b.nombre).toBe('Profesora B de Prueba');
    expect(b.profesor_id).toBe(PB);
  });

  it('CA-63_un_profesor_inactivo_da_409_PROFESOR_INACTIVO_en_la_agenda_y_solo_nombre_y_activo_en_config_publica', async () => {
    await sql(`update public.profesor set activo = false where id = ${DE_A}`);
    try {
      const r = await agendaCruda(LUNES, SLUG_A);
      expect(r.status, r.texto).toBe(409);
      expect((JSON.parse(r.texto) as { message: string }).message).toBe('PROFESOR_INACTIVO');
      const c = (await rpc('anon', 'config_publica', { p_slug: SLUG_A })).cuerpo as Record<string, unknown>;
      expect(Object.keys(c).sort()).toEqual(['activo', 'nombre', 'profesor_id']);
      expect(c.activo).toBe(false);
      expect(await huecos(LUNES, SLUG_B)).toHaveLength(9); // el otro profesor sigue igual
    } finally {
      await sql('update public.profesor set activo = true');
    }
  });

  it('CA-47_CA-63_las_funciones_de_transicion_sin_slug_ya_no_existen_tras_la_contraccion_0539', async () => {
    // Catálogo: no queda config_publica() ni agenda_publica(date); solo las versiones con slug.
    const firmas = await sql<{ f: string }>(
      "select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('config_publica', 'agenda_publica') order by 1",
    );
    expect(firmas.map((x) => x.f)).toEqual(['agenda_publica(p_slug text, p_dia date)', 'config_publica(p_slug text)']);
    // API: PostgREST no la encuentra (PGRST202), no es un 404 de la aplicación.
    const e = entorno();
    for (const [fn, cuerpo] of [
      ['agenda_publica', { p_dia: LUNES }],
      ['config_publica', {}],
    ] as const) {
      const r = await fetch(`${e.apiUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: e.anonKey, Authorization: `Bearer ${e.anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const texto = await r.text();
      expect(r.status, `${fn}: ${texto}`).toBe(404);
      expect((JSON.parse(texto) as { code: string }).code, fn).toBe('PGRST202');
    }
  });
});
