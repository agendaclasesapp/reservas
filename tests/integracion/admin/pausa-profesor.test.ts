// B15 · T15.3 · pausa de un profesor (CA-63 rama de B15, CA-64, ADM-05, AGE-11, DEC-30) por la API real: el Administrador
// inactiva a A con clases y alumnos, su enlace cambia, lo de B no, y al reactivarlo todo queda como antes. Las ramas de
// solicitudes, respuesta y gestión cierran en B06 a B09. A y B se reactivan siempre al terminar; los datos son sintéticos
// (prefijo `T05 ` que borra limpiarT05) y se borran.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rest, rpc, sesionDe, SLUG_A, SLUG_B, type Rol } from '../../soporte/usuarios';
import { crearAlumno, crearClase, limpiarT05, mailT05, profesorId } from '../cuentas/ayuda';
import { cuerpoDe, fotoDe, registrar, rpcAdmin, rpcAnon } from './ayuda';

const HOY = '2026-11-05';
const setActivo = (slug: string, activo: boolean) => sql('update public.profesor set activo = $1 where slug = $2', [activo, slug]);

let pa: string;
let pb: string;

beforeAll(async () => {
  for (const r of ['administrador', 'profesor', 'profesorB', 'alumno', 'alumnoB', 'dosVinculos'] as Rol[]) await sesionDe(r);
  await limpiarT05();
  pa = await profesorId(SLUG_A);
  pb = await profesorId(SLUG_B);
}, 300_000);
afterEach(async () => {
  await setActivo(SLUG_A, true);
  await setActivo(SLUG_B, true);
});
afterAll(async () => {
  await setActivo(SLUG_A, true);
  await setActivo(SLUG_B, true);
  await limpiarT05();
  await cerrar();
});

/** A y B con alumnos, clases confirmadas y una cuenta pendiente cada uno. */
async function datos() {
  await limpiarT05();
  const mateo = await crearAlumno({ nombre: 'Mateo de A', estado: 'aprobado', telefono: '+598 99 700 001', mail: mailT05('mateo') }, SLUG_A);
  const pendienteA = await crearAlumno({ nombre: 'Pendiente de A', estado: 'pendiente', telefono: '+598 99 700 002', mail: mailT05('penda') }, SLUG_A);
  await crearClase(mateo, '2026-11-05T13:00:00Z', SLUG_A);
  await crearClase(mateo, '2026-11-12T13:00:00Z', SLUG_A);
  const nora = await crearAlumno({ nombre: 'Nora de B', estado: 'aprobado', telefono: '+598 99 700 003', mail: mailT05('nora') }, SLUG_B);
  await crearClase(nora, '2026-11-05T13:00:00Z', SLUG_B);
  return { mateo, pendienteA, nora };
}

describe('CA-63 rama de B15: el Administrador inactiva y reactiva a un profesor con clases y alumnos', () => {
  it('CA-63_T-ADM-11_inactivar_cambia_el_enlace_de_A_y_nada_de_lo_suyo_ni_de_B_y_reactivar_lo_deja_todo_como_antes', async () => {
    const { mateo } = await datos();
    const fa = await fotoDe(pa);
    const fb = await fotoDe(pb);
    const cfgA = (await rpcAnon('config_publica', { p_slug: SLUG_A })).texto;
    const cfgB = (await rpcAnon('config_publica', { p_slug: SLUG_B })).texto;
    const agB = (await rpcAnon('agenda_publica', { p_slug: SLUG_B, p_dia: HOY })).texto;
    const agA = (await rpcAnon('agenda_publica', { p_slug: SLUG_A, p_dia: HOY })).texto;

    const baja = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: false });
    registrar('CA-63_T-ADM-11_inactivar', { profesor: SLUG_A, activo: false }, { status: baja.status, cuerpo: baja.cuerpo });
    expect(baja.status, JSON.stringify(baja.cuerpo)).toBe(200);
    expect(cuerpoDe(baja)).toEqual({ profesor_id: pa, activo: false });

    // El enlace de A solo dice que no toma reservas; su agenda no se muestra (también con sesión).
    const cfgInactivo = await rpcAnon('config_publica', { p_slug: SLUG_A });
    expect(cfgInactivo.status).toBe(200);
    expect(cfgInactivo.cuerpo).toEqual({ profesor_id: pa, nombre: 'Profesor de Prueba', activo: false });
    const ag = await rpcAnon('agenda_publica', { p_slug: SLUG_A, p_dia: HOY });
    expect(ag.status).toBe(409);
    expect(cuerpoDe(ag).message).toBe('PROFESOR_INACTIVO');
    expect((await rpc('alumnoB', 'agenda_publica', { p_slug: SLUG_A, p_dia: HOY })).status).toBe(409);
    // Nadie le pide acceso a A.
    const pedido = await rpc('alumnoB', 'pedir_inscripcion', { p_slug: SLUG_A, p_como_llego: 'Amigos' });
    expect(pedido.status).toBe(409);
    expect(cuerpoDe(pedido).message).toBe('PROFESOR_INACTIVO');

    // Lo suyo no cambió y lo de B tampoco (ni su enlace).
    expect(await fotoDe(pa), 'clases, reservas, vínculos, grilla y mails de A').toBe(fa);
    expect(await fotoDe(pb)).toBe(fb);
    expect((await rpcAnon('config_publica', { p_slug: SLUG_B })).texto).toBe(cfgB);
    expect((await rpcAnon('agenda_publica', { p_slug: SLUG_B, p_dia: HOY })).texto).toBe(agB);
    expect((await sql<{ n: string }>('select count(*)::text n from public.clase where profesor_id = $1 and estado = $2', [pa, 'confirmada']))[0].n).toBe('2');

    // El profesor entra, se ve inactivo y sigue viendo a sus alumnos; la persona aprobada con A ve a A inactivo en su selector.
    const ses = cuerpoDe(await rpc('profesor', 'sesion_actual'));
    expect(ses).toMatchObject({ rol: 'profesor', profesor: { slug: SLUG_A, activo: false } });
    expect(((await rest('profesor', 'GET', `v_alumnos?select=id&id=eq.${mateo}`)).cuerpo as unknown[]).length).toBe(1);
    const insc = cuerpoDe(await rpc('dosVinculos', 'sesion_actual')).inscripciones as { slug: string; profesor_activo: boolean }[];
    expect(insc.find((i) => i.slug === SLUG_A)?.profesor_activo).toBe(false);
    expect(insc.find((i) => i.slug === SLUG_B)?.profesor_activo).toBe(true);

    // Reactivar: el enlace y la agenda de A vuelven exactamente como estaban.
    const alta = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: true });
    registrar('CA-63_T-ADM-11_reactivar', { profesor: SLUG_A, activo: true }, { status: alta.status, cuerpo: alta.cuerpo });
    expect(cuerpoDe(alta)).toEqual({ profesor_id: pa, activo: true });
    expect((await rpcAnon('config_publica', { p_slug: SLUG_A })).texto).toBe(cfgA);
    expect((await rpcAnon('agenda_publica', { p_slug: SLUG_A, p_dia: HOY })).texto).toBe(agA);
    expect(await fotoDe(pa)).toBe(fa);
    expect(await fotoDe(pb)).toBe(fb);
    expect(cuerpoDe(await rpc('profesor', 'sesion_actual'))).toMatchObject({ profesor: { slug: SLUG_A, activo: true } });
  });

  it('CA-63_T-ADM-14_el_profesor_inactivo_no_aprueba_ni_da_de_alta_pero_el_de_B_activo_si_sigue_operando', async () => {
    const { pendienteA } = await datos();
    await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: false });
    const aprobar = await rpc('profesor', 'aprobar_cuenta', { p_alumno_id: pendienteA });
    expect(aprobar.status, JSON.stringify(aprobar.cuerpo)).toBe(409);
    expect(cuerpoDe(aprobar).message).toBe('PROFESOR_INACTIVO');
    expect((await sql<{ estado: string }>('select estado from public.inscripcion where alumno_id = $1', [pendienteA]))[0].estado).toBe('pendiente');
    // B, activo, sigue operando (lo de otros profesores no cambia).
    const altaB = await rpc('profesorB', 'alta_alumno', { p_nombre: 'T05 Nuevo de B', p_telefono: '+598 99 700 009', p_fecha_nacimiento: '1990-01-01', p_mail: mailT05('nuevob') });
    expect(altaB.status, JSON.stringify(altaB.cuerpo)).toBe(200);
  });

  it('ADM-05_repetir_la_pausa_o_la_reactivacion_responde_igual_y_no_cambia_nada', async () => {
    await datos();
    const fa = await fotoDe(pa);
    const r1 = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: false });
    const r2 = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: false });
    expect(cuerpoDe(r1)).toEqual(cuerpoDe(r2));
    expect(await fotoDe(pa)).toBe(fa);
    const r3 = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: true });
    const r4 = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: true });
    expect([r3.status, r4.status]).toEqual([200, 200]);
    expect(cuerpoDe(r4)).toEqual({ profesor_id: pa, activo: true });
    expect(await fotoDe(pa)).toBe(fa);
  });

  it('SEC-09_p_activo_nulo_da_422_p_activo_y_un_id_inexistente_404_NO_ENCONTRADO', async () => {
    const nulo = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pa, p_activo: null });
    registrar('SEC-09_p_activo_nulo', { p_profesor_id: pa, p_activo: null }, { status: nulo.status, cuerpo: nulo.cuerpo });
    expect(nulo.status).toBe(422);
    expect(cuerpoDe(nulo).message).toBe('DATOS_INVALIDOS');
    expect(JSON.parse(cuerpoDe(nulo).details as string)).toEqual({ campo: 'p_activo' });
    const nada = await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: '00000000-0000-0000-0000-00000000aaaa', p_activo: false });
    expect(nada.status).toBe(404);
    expect(cuerpoDe(nada).message).toBe('NO_ENCONTRADO');
    expect((await sql<{ activo: boolean }>('select activo from public.profesor where id = $1', [pa]))[0].activo).toBe(true);
  });
});

describe('CA-64 solo el Administrador inactiva o reactiva', () => {
  it('CA-64_T-ADM-17_alumno_y_profesores_reciben_403_incluso_sobre_si_mismos_y_el_estado_no_cambia', async () => {
    for (const [rol, objetivo] of [
      ['alumno', pb],
      ['dosVinculos', pa],
      ['profesor', pb],
      ['profesor', pa],
      ['profesorB', pb],
      ['profesorB', pa],
    ] as [Rol, string][]) {
      for (const activo of [false, true]) {
        const r = await rpc(rol, 'cambiar_estado_profesor', { p_profesor_id: objetivo, p_activo: activo });
        registrar('CA-64_T-ADM-17', { rol, objetivo, activo }, { status: r.status, cuerpo: r.cuerpo });
        expect(r.status, `${rol} -> ${objetivo}`).toBe(403);
        expect(cuerpoDe(r).message).toBe('PROHIBIDO');
      }
    }
    expect((await sql<{ slug: string; activo: boolean }>('select slug, activo from public.profesor where slug in ($1, $2) order by slug', [SLUG_A, SLUG_B])).map((p) => p.activo)).toEqual([true, true]);
  });

  it('CA-64_T-ADM-18_la_lista_muestra_el_estado_de_cada_profesor_y_cambia_con_la_pausa', async () => {
    const estadoDe = async (slug: string) => {
      const l = await rpcAdmin('listar_profesores', {});
      expect(l.status, JSON.stringify(l.cuerpo)).toBe(200);
      return (l.cuerpo as { slug: string; activo: boolean }[]).find((p) => p.slug === slug)!.activo;
    };
    expect([await estadoDe(SLUG_A), await estadoDe(SLUG_B)]).toEqual([true, true]);
    await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pb, p_activo: false });
    expect([await estadoDe(SLUG_A), await estadoDe(SLUG_B)]).toEqual([true, false]);
    await rpcAdmin('cambiar_estado_profesor', { p_profesor_id: pb, p_activo: true });
    expect(await estadoDe(SLUG_B)).toBe(true);
  });

  it('CA-64_DEC-30_T-ADM-19_no_existe_baja_ni_cambio_de_enlace_ni_siquiera_para_el_Administrador', async () => {
    const antes = (await sql('select slug, activo, nombre from public.profesor where id = $1', [pa]))[0];
    const cambio = await rest('administrador', 'PATCH', `profesor?id=eq.${pa}`, { slug: 'otro-enlace' });
    const baja = await rest('administrador', 'DELETE', `profesor?id=eq.${pa}`);
    registrar('CA-64_T-ADM-19', { patch: { slug: 'otro-enlace' }, delete: pa }, { patch: cambio.status, delete: baja.status });
    for (const r of [cambio, baja]) expect([401, 403, 404], JSON.stringify(r.cuerpo)).toContain(r.status);
    expect((await sql('select slug, activo, nombre from public.profesor where id = $1', [pa]))[0]).toEqual(antes);
  });
});
