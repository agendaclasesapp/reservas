// B05 · T05.3 · Unión por teléfono normalizado, alta con y sin mail y edad con reloj fijo contra la API local
// (CA-04, CA-06, CA-07, SEC-02, SEC-06, SEC-09; casos T-ALU-09 a T-ALU-11, T-ALU-13, T-ALU-16 a T-ALU-19). Sesiones reales
// (código de Mailpit); los datos del caso se preparan por la base y llevan el prefijo `T05 ` para limpiarse. El reloj de la
// aplicación se fija por la base (ADR-014) y se restaura siempre.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { fijarReloj } from '../../soporte/reloj';
import { ingresarPorCodigo, rest, rpc, sesionDe, SLUG_A, SLUG_B } from '../../soporte/usuarios';
import { crearAlumno, crearClase, inscripcionDe, limpiarT05, mailT05, PREFIJO_NOMBRE, registrar, restaurarReloj, rpcCon } from './ayuda';

beforeAll(async () => {
  await sesionDe('profesor');
  await sesionDe('profesorB');
  await sesionDe('administrador');
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
    expect((await inscripcionDe(e.cuenta))!.estado).toBe('aprobado');
    const sug = cuerpoDe(apr).sugerencias as { sin_cuenta_id: string }[];
    expect(sug.map((s) => s.sin_cuenta_id)).toEqual([e.sinCuenta]);
  });

  it('CA-58_la_sugerencia_compara_solo_con_los_sin_cuenta_del_mismo_profesor_y_B_no_puede_unir_lo_de_A', async () => {
    const e = await escenario();
    // Un sin cuenta de B con el mismo teléfono que la cuenta de A: no es sugerencia para A ni para B.
    const deB = await crearAlumno({ nombre: 'Sin cuenta de B', estado: 'sin_cuenta', telefono: '099 123456' }, SLUG_B);
    const sug = await rpc('profesor', 'sugerencias_union', { p_alumno_id: e.cuenta });
    expect((sug.cuerpo as { sin_cuenta_id: string }[]).map((s) => s.sin_cuenta_id)).toEqual([e.sinCuenta]);
    const deOtro = await rpc('profesorB', 'sugerencias_union', { p_alumno_id: e.cuenta });
    const nada = await rpc('profesorB', 'sugerencias_union', { p_alumno_id: '00000000-0000-0000-0000-00000000dead' });
    registrar('CA-58_CA-52', { cuenta: e.cuenta, deB }, { propia: sug.cuerpo, deOtro: [deOtro.status, deOtro.cuerpo] });
    expect(deOtro, 'B no ve la cuenta de A: 404 como un id inexistente').toEqual(nada);
    expect(deOtro.status).toBe(404);
    for (const f of ['unir_alumnos', 'descartar_union']) {
      expect((await rpc('profesorB', f, { p_cuenta_id: e.cuenta, p_sin_cuenta_id: deB })).status, f).toBe(404);
      expect((await rpc('profesor', f, { p_cuenta_id: e.cuenta, p_sin_cuenta_id: deB })).status, `${f} con un sin cuenta de B`).toBe(404);
    }
    expect((await sql('select 1 from public.alumno where id = $1', [deB])).length).toBe(1);
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
    expect((await inscripcionDe(e.sinCuenta))!.estado).toBe('sin_cuenta');
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
    expect(alta.cuerpo).toMatchObject({ estado: 'aprobado', asociado: false });
    const s = await ingresarPorCodigo(mail);
    const ses = await rpcCon(s.accessToken, 'sesion_actual', {});
    registrar('CA-06_T-ALU-16_sesion', { mail }, { status: ses.status, cuerpo: ses.cuerpo });
    expect(ses.cuerpo).toMatchObject({ rol: 'alumno', estado: 'completa', nombre: `${PREFIJO_NOMBRE}Alta`, inscripciones: [{ slug: SLUG_A, estado: 'aprobado' }] });
    const [fila] = await sql<{ id: string; user_id: string }>('select id, user_id from public.alumno where mail = $1', [mail]);
    expect(fila.user_id).toBe(s.userId);
    expect(fila.id).toBe((alta.cuerpo as { alumno_id: string }).alumno_id);
  }, 120_000);

  it('CA-06_T-ALU-17_el_alta_sin_mail_queda_sin_cuenta_sin_forma_de_ingresar_ni_mails', async () => {
    const alta = await rpc('profesor', 'alta_alumno', { p_nombre: `${PREFIJO_NOMBRE}Sin mail`, p_telefono: '+598 96 000 222', p_fecha_nacimiento: '1996-07-16' });
    registrar('CA-06_T-ALU-17', { p_mail: null }, { status: alta.status, cuerpo: alta.cuerpo });
    expect(alta.status).toBe(200);
    expect(alta.cuerpo).toMatchObject({ estado: 'sin_cuenta', asociado: false });
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
    // CA-61: el mail del otro profesor o del Administrador da 409 sin datos de esa persona (DEC-31).
    const profe = await rpc('profesor', 'alta_alumno', { ...base, p_mail: (await sesionDe('profesorB')).mail });
    expect(profe.status).toBe(409);
    expect(cuerpoDe(profe).message).toBe('MAIL_YA_REGISTRADO');
    const admin = await rpc('profesor', 'alta_alumno', { ...base, p_mail: (await sesionDe('administrador')).mail });
    expect(admin.status).toBe(409);
    expect(cuerpoDe(admin).message).toBe('MAIL_YA_REGISTRADO');
    expect(JSON.stringify([profe.cuerpo, admin.cuerpo])).not.toMatch(/uuid|alumno_id|[0-9a-f]{8}-[0-9a-f]{4}/);
    const malo = await rpc('profesor', 'alta_alumno', { ...base, p_mail: 'no-es-un-mail' });
    expect(malo.status).toBe(422);
    expect(JSON.stringify(malo.cuerpo)).toContain('p_mail');
    const tel = await rpc('profesor', 'alta_alumno', { ...base, p_telefono: 'abc' });
    expect(tel.status).toBe(422);
    expect(JSON.stringify(tel.cuerpo)).toContain('p_telefono');
    registrar('ALU-07_negativos', { mail_repetido: mail.toUpperCase() }, { repetido: repetido.status, profe: profe.status, admin: admin.status, malo: malo.status, tel: tel.status });
  });

  it('CA-61_DEC-29b_el_profesor_B_da_de_alta_con_el_mail_de_una_cuenta_de_A_y_la_deja_aprobada_con_B_sin_tocar_su_ficha_ni_su_vinculo_con_A', async () => {
    const mail = mailT05('asociada');
    const s = await ingresarPorCodigo(mail);
    const ficha = await rpcCon(s.accessToken, 'completar_ficha', { p_nombre: `${PREFIJO_NOMBRE}Asociada`, p_telefono: '+598 96 111 222', p_fecha_nacimiento: '1994-04-04', p_slug: SLUG_A, p_como_llego: 'Amigos' });
    expect(ficha.status).toBe(200);
    const [antes] = await sql<{ id: string; nombre: string; telefono: string; n: string }>('select id, nombre, telefono, (select count(*)::text from public.alumno where mail = $1) n from public.alumno where mail = $1', [mail]);
    const alta = await rpc('profesorB', 'alta_alumno', { p_nombre: `${PREFIJO_NOMBRE}Otro nombre`, p_telefono: '+598 96 999 999', p_fecha_nacimiento: '1980-01-01', p_mail: mail });
    registrar('CA-61_asociada', { p_mail: mail }, { status: alta.status, cuerpo: alta.cuerpo });
    expect(alta.status).toBe(200);
    expect(alta.cuerpo).toMatchObject({ alumno_id: antes.id, estado: 'aprobado', asociado: true });
    const [despues] = await sql<{ nombre: string; telefono: string; n: string }>('select nombre, telefono, (select count(*)::text from public.alumno where mail = $1) n from public.alumno where id = $2', [mail, antes.id]);
    expect(despues, 'no se crea otra cuenta ni cambia la ficha').toEqual({ nombre: antes.nombre, telefono: antes.telefono, n: '1' });
    expect((await inscripcionDe(antes.id, SLUG_B))!.estado).toBe('aprobado');
    expect((await inscripcionDe(antes.id, SLUG_A))!.estado, 'su vínculo con A no cambia').toBe('pendiente');
    const ses = await rpcCon(s.accessToken, 'sesion_actual', {});
    expect((ses.cuerpo as { inscripciones: { slug: string; estado: string }[] }).inscripciones.map((i) => [i.slug, i.estado])).toEqual([[SLUG_A, 'pendiente'], [SLUG_B, 'aprobado']]);
    // B ve la ficha que ya tenía; A sigue sin verla aprobada.
    const lista = await rest('profesorB', 'GET', `v_alumnos?select=id,nombre,estado,editable&id=eq.${antes.id}`);
    expect(lista.cuerpo).toMatchObject([{ id: antes.id, nombre: antes.nombre, estado: 'aprobado', editable: false }]);
    // La persona recibe el mail de AVI-04 (alumno_sumado).
    const [fila] = await sql<{ n: number }>("select count(*)::int n from public.mail_salida where tipo = 'alumno_sumado' and alumno_id = $1", [antes.id]);
    expect(fila.n, 'AVI-04: un mail alumno_sumado').toBe(1);
  }, 120_000);

  it('SEC-06_un_alumno_no_da_de_alta_ni_edita_alumnos_403', async () => {
    const id = await crearAlumno({ nombre: 'Ajeno', estado: 'sin_cuenta', telefono: '+598 96 000 555' });
    const a = await rpc('alumno', 'alta_alumno', { p_nombre: 'X', p_telefono: '+598 96 000 666', p_fecha_nacimiento: '1996-07-16' });
    expect(a.status).toBe(403);
    const e = await rpc('alumno', 'editar_alumno', { p_alumno_id: id, p_nombre: 'Y', p_telefono: '+598 96 000 555', p_fecha_nacimiento: '1990-01-01', p_mail: null });
    expect(e.status).toBe(403);
    // CA-50: el Administrador tampoco opera sobre alumnos; CA-52: B recibe el 404 de un id inexistente.
    for (const f of ['alta_alumno', 'editar_alumno'] as const) {
      const args = f === 'alta_alumno' ? { p_nombre: 'X', p_telefono: '+598 96 000 666', p_fecha_nacimiento: '1996-07-16' } : { p_alumno_id: id, p_nombre: 'Y', p_telefono: '+598 96 000 555', p_fecha_nacimiento: '1990-01-01', p_mail: null };
      expect((await rpc('administrador', f, args)).status, `administrador ${f}`).toBe(403);
    }
    const deB = await rpc('profesorB', 'editar_alumno', { p_alumno_id: id, p_nombre: 'Y', p_telefono: '+598 96 000 555', p_fecha_nacimiento: '1990-01-01', p_mail: null });
    const nada = await rpc('profesorB', 'editar_alumno', { p_alumno_id: '00000000-0000-0000-0000-00000000dead', p_nombre: 'Y', p_telefono: '+598 96 000 555', p_fecha_nacimiento: '1990-01-01', p_mail: null });
    expect(deB.status).toBe(404);
    expect(deB).toEqual(nada);
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
    // CA-52 / CA-50: ni el otro profesor ni el Administrador la ven.
    for (const rol of ['profesorB', 'administrador'] as const) {
      const r = await rest(rol, 'GET', `v_alumnos?select=id&id=eq.${id}`);
      expect(r.status, rol).toBe(200);
      expect(r.cuerpo, rol).toEqual([]);
    }
    expect(((await rest('profesor', 'GET', `v_alumnos?select=id&id=eq.${id}`)).cuerpo as unknown[]).length).toBe(1);
    const anon = await rest('anon', 'GET', 'v_alumnos?select=id');
    expect([401, 403]).toContain(anon.status);
  });
});
