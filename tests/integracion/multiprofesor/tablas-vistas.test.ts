// B14 · T14.5 · tablas y vistas con dos profesores y el Administrador, por PostgREST (ADM-04, NFR-01, SEC-01, SEC-02):
// el Administrador no lee datos de operación por ninguna tabla ni vista (ni siquiera cero filas con datos), `anon` sigue sin
// acceso y cada profesor ve solo sus mails fallidos. Casos: CA-50 (rama RLS), CA-52 (rama lista), SEC-01, SEC-02.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rest, sesionDe, type Rol } from '../../soporte/usuarios';

let objetos: string[] = [];

beforeAll(async () => {
  objetos = (
    await sql<{ relname: string }>(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v') order by 1",
    )
  ).map((f) => f.relname);
  for (const r of ['profesor', 'profesorB', 'administrador', 'alumno', 'dosVinculos'] as Rol[]) await sesionDe(r);
}, 300_000);
afterAll(cerrar);

describe('CA-50 / ADM-04 el Administrador no lee datos de operación', () => {
  it('CA-50_ADM-04_ninguna_tabla_ni_vista_de_public_devuelve_filas_al_administrador', async () => {
    expect(objetos).toEqual(expect.arrayContaining(['profesor', 'alumno', 'inscripcion', 'v_alumnos']));
    const malas: string[] = [];
    for (const t of objetos) {
      const r = await rest('administrador', 'GET', `${t}?select=*`);
      const vacio = r.status === 200 && Array.isArray(r.cuerpo) && r.cuerpo.length === 0;
      if (!vacio && ![401, 403].includes(r.status)) malas.push(`${t}: ${r.status} ${JSON.stringify(r.cuerpo).slice(0, 80)}`);
    }
    expect(malas).toEqual([]);
  });

  it('CA-50_ADM-04_el_administrador_no_ve_las_mias_ni_las_ajenas_ni_siquiera_cuando_hay_datos', async () => {
    const [{ n }] = await sql<{ n: string }>('select count(*)::text n from public.inscripcion');
    expect(Number(n), 'la base tiene inscripciones: el cero filas del Administrador es por RLS, no por falta de datos').toBeGreaterThan(0);
    expect((await rest('administrador', 'GET', 'inscripcion?select=alumno_id')).cuerpo).toEqual([]);
    expect((await rest('administrador', 'GET', 'v_alumnos?select=id')).cuerpo).toEqual([]);
  });
});

describe('SEC-01 / SEC-02 anon y roles de profesor sobre las tablas nuevas', () => {
  it('SEC-01_inscripcion_y_las_vistas_no_se_leen_como_anon', async () => {
    for (const t of ['inscripcion', 'v_alumnos', 'v_mails_fallidos', 'profesor']) {
      const r = await rest('anon', 'GET', `${t}?select=*`);
      expect([401, 403], t).toContain(r.status);
    }
  });

  it('SEC-02_cada_profesor_ve_solo_su_fila_de_profesor_y_sus_inscripciones', async () => {
    const [a, b] = [await rest('profesor', 'GET', 'profesor?select=slug'), await rest('profesorB', 'GET', 'profesor?select=slug')];
    expect(a.cuerpo).toEqual([{ slug: 'profesor-prueba' }]);
    expect(b.cuerpo).toEqual([{ slug: 'profesora-b' }]);
    for (const [rol, otro] of [['profesor', 'profesora-b'], ['profesorB', 'profesor-prueba']] as const) {
      const r = await rest(rol, 'GET', 'inscripcion?select=profesor_id');
      const ids = new Set((r.cuerpo as { profesor_id: string }[]).map((f) => f.profesor_id));
      expect(ids.size, `${rol} ve inscripciones de un único profesor`).toBeLessThanOrEqual(1);
      const [{ id }] = await sql<{ id: string }>('select id from public.profesor where slug = $1', [otro]);
      expect(ids.has(id), `${rol} no ve inscripciones de ${otro}`).toBe(false);
    }
  });

  it('SEC-02_v_mails_fallidos_de_cada_profesor_no_incluye_los_del_otro', async () => {
    const [{ id: pa }] = await sql<{ id: string }>("select id from public.profesor where slug = 'profesor-prueba'");
    const [{ id: pb }] = await sql<{ id: string }>("select id from public.profesor where slug = 'profesora-b'");
    const marca = `t14.fallido.${Date.now()}@example.test`;
    await sql(
      `insert into public.mail_salida (tipo, profesor_id, destinatario, asunto, cuerpo_texto, estado, motivo_fallo)
       values ('cuenta_nueva', $1, $3, 'T14 fallido de A', 'x', 'fallido', 'prueba'), ('cuenta_nueva', $2, $4, 'T14 fallido de B', 'x', 'fallido', 'prueba')`,
      [pa, pb, `a.${marca}`, `b.${marca}`],
    );
    try {
      const deA = JSON.stringify((await rest('profesor', 'GET', 'v_mails_fallidos?select=*')).cuerpo);
      const deB = JSON.stringify((await rest('profesorB', 'GET', 'v_mails_fallidos?select=*')).cuerpo);
      expect(deA).toContain(`a.${marca}`);
      expect(deA).not.toContain(`b.${marca}`);
      expect(deB).toContain(`b.${marca}`);
      expect(deB).not.toContain(`a.${marca}`);
      expect(JSON.stringify((await rest('administrador', 'GET', 'v_mails_fallidos?select=*')).cuerpo)).not.toContain(marca);
    } finally {
      await sql("delete from public.mail_salida where destinatario like $1", [`%${marca}`]);
    }
  });
});
