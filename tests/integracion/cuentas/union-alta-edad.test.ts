// B05 · T05.3 · Unión por teléfono normalizado, alta con y sin mail y edad con reloj fijo contra la API local
// (CA-04, CA-06, CA-07, SEC-02, SEC-06, SEC-09; casos T-ALU-09 a T-ALU-11, T-ALU-13, T-ALU-16 a T-ALU-19). Sesiones reales
// (código de Mailpit); los datos del caso se preparan por la base y llevan el prefijo `T05 ` para limpiarse. El reloj de la
// aplicación se fija por la base (ADR-014) y se restaura siempre.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj } from '../../soporte/reloj';
import { ingresarPorCodigo, rest, rpc, sesionDe } from '../../soporte/usuarios';
import { crearAlumno, crearClase, limpiarT05, mailT05, PREFIJO_NOMBRE, registrar, restaurarReloj, rpcCon } from './ayuda';

beforeAll(async () => {
  await sesionDe('profesor');
  await sesionDe('alumno');
  await limpiarT05();
}, 300_000);
afterEach(async () => {
  await restaurarReloj();
  await limpiarT05();
});
afterAll(cerrar);

const cuerpoDe = (r: { cuerpo: unknown }) => r.cuerpo as Record<string, unknown>;

describe('CA-04 unión por teléfono normalizado (ALU-04, ALU-05)', () => {
  async function escenario() {
    const cuenta = await crearAlumno({ nombre: 'Cuenta', estado: 'pendiente', telefono: '099 123-456', mail: mailT05('cuenta') });
    const sinCuenta = await crearAlumno({ nombre: 'Sin cuenta', estado: 'sin_cuenta', telefono: '+598 99123456' });
    const otro = await crearAlumno({ nombre: 'Otro', estado: 'sin_cuenta', telefono: '091 000-000' });
    const clase = await crearClase(sinCuenta, '2026-12-03T13:00:00Z');
    return { cuenta, sinCuenta, otro, clase };
  }

  it('CA-04_T-ALU-09_al_aprobar_aparece_la_sugerencia_con_el_telefono_normalizado_y_no_la_de_otro_telefono', async () => {
    const e = await escenario();
    const antes = await rpc('profesor', 'sugerencias_union', { p_alumno_id: e.cuenta });
    expect(antes.status).toBe(200);
    expect(cuerpoDe({ cuerpo: (antes.cuerpo as unknown[])[0] })).toMatchObject({ sin_cuenta_id: e.sinCuenta });
    expect((antes.cuerpo as unknown[]).length).toBe(1);
    const apr = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: e.cuenta });
    registrar('CA-04_T-ALU-09', { cuenta: '099 123-456', sinCuenta: '+598 99123456', otro: '091 000-000' }, { status: apr.status, cuerpo: apr.cuerpo });
    expect(apr.status).toBe(200);
    expect(cuerpoDe(apr).estado).toBe('aprobado');
    const sug = cuerpoDe(apr).sugerencias as { sin_cuenta_id: string }[];
    expect(sug.map((s) => s.sin_cuenta_id)).toEqual([e.sinCuenta]);
  });

  it('CA-04_T-ALU-10_al_confirmar_las_clases_pasan_a_la_cuenta_y_el_alumno_sin_cuenta_ya_no_existe', async () => {
    const e = await escenario();
    await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: e.cuenta });
    const r = await rpc('profesor', 'unir_alumnos', { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.sinCuenta });
    registrar('CA-04_T-ALU-10', { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.sinCuenta }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(200);
    expect((await sql('select 1 from public.alumno where id = $1', [e.sinCuenta])).length).toBe(0);
    const clases = await sql<{ id: string }>('select id from public.clase where alumno_id = $1', [e.cuenta]);
    expect(clases.map((c) => c.id)).toEqual([e.clase]);
    expect((await sql<{ n: number }>('select count(*)::int as n from public.clase where id = $1', [e.clase]))[0].n).toBe(1);
    const otra = await rpc('profesor', 'unir_alumnos', { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.sinCuenta });
    expect(otra.status, 'repetir la unión').toBe(404);
  });

  it('CA-04_T-ALU-11_al_descartar_nada_cambia_y_la_sugerencia_no_vuelve', async () => {
    const e = await escenario();
    await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: e.cuenta });
    const d = await rpc('profesor', 'descartar_union', { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.sinCuenta });
    expect(d.status).toBe(200);
    registrar('CA-04_T-ALU-11', { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.sinCuenta }, { status: d.status, cuerpo: d.cuerpo });
    expect(((await rpc('profesor', 'sugerencias_union', { p_alumno_id: e.cuenta })).cuerpo as unknown[]).length).toBe(0);
    expect((await sql<{ estado: string }>('select estado from public.alumno where id = $1', [e.sinCuenta]))[0].estado).toBe('sin_cuenta');
    expect((await sql<{ alumno_id: string }>('select alumno_id from public.clase where id = $1', [e.clase]))[0].alumno_id).toBe(e.sinCuenta);
  });

  it('CA-04_unir_o_descartar_un_par_con_telefonos_distintos_da_409_UNION_NO_VALIDA', async () => {
    const e = await escenario();
    await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: e.cuenta });
    for (const f of ['unir_alumnos', 'descartar_union']) {
      const r = await rpc('profesor', f, { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.otro });
      expect(r.status, f).toBe(409);
      expect(cuerpoDe(r).message).toBe('UNION_NO_VALIDA');
    }
    expect((await sql('select 1 from public.alumno where id = $1', [e.otro])).length).toBe(1);
  });

  it('T-ALU-13_un_alumno_no_une_ni_descarta_ni_sugiere_y_nada_cambia', async () => {
    const e = await escenario();
    await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: e.cuenta });
    for (const [f, args] of [
      ['unir_alumnos', { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.sinCuenta }],
      ['descartar_union', { p_cuenta_id: e.cuenta, p_sin_cuenta_id: e.sinCuenta }],
      ['sugerencias_union', { p_alumno_id: e.cuenta }],
      ['aprobar_cuenta', { p_alumno_id: e.cuenta }],
    ] as [string, Record<string, unknown>][]) {
      const r = await rpc('alumno', f, args);
      expect(r.status, f).toBe(403);
    }
    expect((await sql('select 1 from public.alumno where id = $1', [e.sinCuenta])).length).toBe(1);
  });
});

describe('CA-06 alta con y sin mail (ALU-07, ALU-08, AVI-04)', () => {
  it('CA-06_T-ALU-16_el_alta_con_mail_entra_con_codigo_sin_pasar_por_aprobacion', async () => {
    const mail = mailT05('alta');
    const alta = await rpc('profesor', 'alta_alumno', { p_nombre: `${PREFIJO_NOMBRE}Alta`, p_telefono: '+598 96 000 111', p_fecha_nacimiento: '1995-06-15', p_mail: mail });
    registrar('CA-06_T-ALU-16_alta', { p_mail: mail }, { status: alta.status, cuerpo: alta.cuerpo });
    expect(alta.status).toBe(200);
    expect(alta.cuerpo).toMatchObject({ estado: 'aprobado' });
    const s = await ingresarPorCodigo(mail);
    const ses = await rpcCon(s.accessToken, 'sesion_actual', {});
    registrar('CA-06_T-ALU-16_sesion', { mail }, { status: ses.status, cuerpo: ses.cuerpo });
    expect(ses.cuerpo).toMatchObject({ rol: 'alumno', estado: 'aprobado', nombre: `${PREFIJO_NOMBRE}Alta` });
    const [fila] = await sql<{ id: string; user_id: string }>('select id, user_id from public.alumno where mail = $1', [mail]);
    expect(fila.user_id).toBe(s.userId);
    expect(fila.id).toBe((alta.cuerpo as { alumno_id: string }).alumno_id);
  }, 120_000);

  it('CA-06_T-ALU-17_el_alta_sin_mail_queda_sin_cuenta_sin_forma_de_ingresar_ni_mails', async () => {
    const alta = await rpc('profesor', 'alta_alumno', { p_nombre: `${PREFIJO_NOMBRE}Sin mail`, p_telefono: '+598 96 000 222', p_fecha_nacimiento: '1996-07-16' });
    registrar('CA-06_T-ALU-17', { p_mail: null }, { status: alta.status, cuerpo: alta.cuerpo });
    expect(alta.status).toBe(200);
    expect(alta.cuerpo).toMatchObject({ estado: 'sin_cuenta' });
    const id = (alta.cuerpo as { alumno_id: string }).alumno_id;
    const [f] = await sql<{ mail: string | null; user_id: string | null }>('select mail, user_id from public.alumno where id = $1', [id]);
    expect(f).toEqual({ mail: null, user_id: null });
    // Una clase que el profesor le crea no manda mail: no hay destinatario (AVI-04).
    expect((await sql<{ n: number }>('select count(*)::int as n from public.mail_salida where alumno_id = $1', [id]))[0].n).toBe(0);
  });

  it('ALU-07_mail_repetido_o_del_profesor_da_409_MAIL_YA_REGISTRADO_y_mail_o_telefono_invalidos_422', async () => {
    const mail = mailT05('repe');
    await crearAlumno({ nombre: 'Existente', estado: 'aprobado', telefono: '+598 96 000 333', mail });
    const base = { p_nombre: `${PREFIJO_NOMBRE}Otro`, p_telefono: '+598 96 000 444', p_fecha_nacimiento: '1996-07-16' };
    const repetido = await rpc('profesor', 'alta_alumno', { ...base, p_mail: mail.toUpperCase() });
    expect(repetido.status).toBe(409);
    expect(cuerpoDe(repetido).message).toBe('MAIL_YA_REGISTRADO');
    const profe = await rpc('profesor', 'alta_alumno', { ...base, p_mail: (await sesionDe('profesor')).mail });
    expect(profe.status).toBe(409);
    const malo = await rpc('profesor', 'alta_alumno', { ...base, p_mail: 'no-es-un-mail' });
    expect(malo.status).toBe(422);
    expect(JSON.stringify(malo.cuerpo)).toContain('p_mail');
    const tel = await rpc('profesor', 'alta_alumno', { ...base, p_telefono: 'abc' });
    expect(tel.status).toBe(422);
    expect(JSON.stringify(tel.cuerpo)).toContain('p_telefono');
    registrar('ALU-07_negativos', { mail_repetido: mail.toUpperCase() }, { repetido: repetido.status, profe: profe.status, malo: malo.status, tel: tel.status });
  });

  it('SEC-06_un_alumno_no_da_de_alta_ni_edita_alumnos_403', async () => {
    const id = await crearAlumno({ nombre: 'Ajeno', estado: 'sin_cuenta', telefono: '+598 96 000 555' });
    const a = await rpc('alumno', 'alta_alumno', { p_nombre: 'X', p_telefono: '+598 96 000 666', p_fecha_nacimiento: '1996-07-16' });
    expect(a.status).toBe(403);
    const e = await rpc('alumno', 'editar_alumno', { p_alumno_id: id, p_nombre: 'Y', p_telefono: '+598 96 000 555', p_fecha_nacimiento: '1990-01-01', p_mail: null });
    expect(e.status).toBe(403);
  });
});

describe('CA-07 lista de alumnos con estado y edad (ALU-09, SEC-02)', () => {
  async function edades(ids: string[]) {
    const r = await rest('profesor', 'GET', `v_alumnos?select=id,estado,edad,nombre&id=in.(${ids.join(',')})`);
    expect(r.status).toBe(200);
    return Object.fromEntries((r.cuerpo as { id: string; estado: string; edad: number }[]).map((f) => [f.id, f]));
  }

  it('CA-07_T-ALU-18_T-ALU-19_edad_con_reloj_fijo_en_el_limite_del_cumpleanos_y_estado_por_fila', async () => {
    await fijarReloj('2026-10-21T15:00:00Z'); // 12:00 en Montevideo
    const hoy = await crearAlumno({ nombre: 'Cumple hoy', estado: 'aprobado', telefono: '+598 95 000 111', fecha_nacimiento: '2000-10-21' });
    const manana = await crearAlumno({ nombre: 'Cumple manana', estado: 'rechazado', telefono: '+598 95 000 222', fecha_nacimiento: '2000-10-22' });
    const pend = await crearAlumno({ nombre: 'Pendiente', estado: 'pendiente', telefono: '+598 95 000 333', fecha_nacimiento: '2000-01-01' });
    const sin = await crearAlumno({ nombre: 'Sin cuenta', estado: 'sin_cuenta', telefono: '+598 95 000 444', fecha_nacimiento: '2000-02-29' });
    const f = await edades([hoy, manana, pend, sin]);
    registrar('CA-07_reloj_2026-10-21', { nacimientos: ['2000-10-21', '2000-10-22', '2000-01-01', '2000-02-29'] }, f);
    expect(f[hoy]).toMatchObject({ estado: 'aprobado', edad: 26 });
    expect(f[manana]).toMatchObject({ estado: 'rechazado', edad: 25 });
    expect(f[pend]).toMatchObject({ estado: 'pendiente', edad: 26 });
    expect(f[sin]).toMatchObject({ estado: 'sin_cuenta', edad: 26 });
    await fijarReloj('2027-02-28T15:00:00Z');
    expect((await edades([sin]))[sin].edad, '28-feb').toBe(26);
    await fijarReloj('2027-03-01T15:00:00Z');
    expect((await edades([sin]))[sin].edad, '1-mar').toBe(27);
  });

  it('CA-07_la_edad_usa_el_huso_del_profesor_a_las_23_30_de_Montevideo', async () => {
    // 2026-10-22 02:30Z = 21-oct 23:30 en Montevideo: todavía es el 21.
    await fijarReloj('2026-10-22T02:30:00Z');
    const id = await crearAlumno({ nombre: 'Cumple 22', estado: 'aprobado', telefono: '+598 95 000 555', fecha_nacimiento: '2000-10-22' });
    expect((await edades([id]))[id].edad).toBe(25);
  });

  it('ALU-09_la_lista_no_trae_fichas_incompletas_ni_borrados', async () => {
    const id = await crearAlumno({ nombre: 'Ficha', estado: 'pendiente', telefono: '+598 95 000 666' });
    await sql(`update public.alumno set estado = 'ficha_incompleta' where id = $1`, [id]);
    expect(Object.keys(await edades([id]))).toEqual([]);
    await sql(`update public.alumno set estado = 'borrado' where id = $1`, [id]);
    expect(Object.keys(await edades([id]))).toEqual([]);
  });

  it('SEC-02_v_alumnos_solo_la_ve_el_profesor', async () => {
    const id = await crearAlumno({ nombre: 'Privado', estado: 'aprobado', telefono: '+598 95 000 777' });
    const a = await rest('alumno', 'GET', `v_alumnos?select=id&id=eq.${id}`);
    expect(a.status).toBe(200);
    expect(a.cuerpo).toEqual([]);
    const anon = await rest('anon', 'GET', 'v_alumnos?select=id');
    expect([401, 403]).toContain(anon.status);
  });
});
