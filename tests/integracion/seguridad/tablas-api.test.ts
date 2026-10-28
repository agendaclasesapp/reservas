// SEC-01, SEC-02, SEC-03, SEC-04 por la API (PostgREST local): anon sin acceso a tablas, escrituras directas
// rechazadas para todos los roles, `privado` fuera de la API y lecturas de alumno acotadas por RLS.
// Casos: T-SOL-19, CA-26, NFR-01.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { entorno } from '../../soporte/entorno';
import { profesorId, rest, rpc, sesionDe, SLUG_A, type Rol } from '../../soporte/usuarios';

let tablas: string[] = [];
// Primera columna real de cada tabla o vista: el filtro y el cuerpo del PATCH usan una columna que existe, para que la
// prueba compruebe el permiso (401/403) y no el esquema (400).
const primeraColumna = new Map<string, string>();

beforeAll(async () => {
  tablas = (await sql<{ relname: string }>("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v') order by 1")).map((f) => f.relname);
  const cols = await sql<{ table_name: string; column_name: string }>(
    "select distinct on (table_name) table_name, column_name from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position",
  );
  for (const c of cols) primeraColumna.set(c.table_name, c.column_name);
  for (const r of ['alumno', 'alumnoB', 'profesor', 'profesorB', 'administrador'] as Rol[]) await sesionDe(r);
}, 300_000);
afterAll(cerrar);

describe('SEC-01 anon sin acceso a tablas ni vistas', () => {
  it('SEC-01_hay_tablas_que_probar', () => {
    expect(tablas).toEqual(expect.arrayContaining(['profesor', 'alumno', 'persona_a_cargo']));
  });
  it('SEC-01_GET_de_cada_tabla_como_anon_es_401_o_403', async () => {
    const malas: string[] = [];
    for (const t of tablas) {
      const r = await rest('anon', 'GET', `${t}?select=*`);
      if (![401, 403].includes(r.status)) malas.push(`${t}: ${r.status}`);
    }
    expect(malas).toEqual([]);
  });
});

describe('SEC-03 la escritura directa falla para todos los roles', () => {
  it('SEC-03_POST_PATCH_y_DELETE_directos_son_401_o_403', async () => {
    const malas: string[] = [];
    for (const rol of ['anon', 'alumno', 'profesor', 'profesorB', 'administrador'] as Rol[]) {
      for (const t of tablas) {
        const col = primeraColumna.get(t) ?? 'id';
        for (const [metodo, ruta, cuerpo] of [
          ['POST', t, {}],
          ['PATCH', `${t}?${col}=not.is.null`, { [col]: null }],
          ['DELETE', `${t}?${col}=not.is.null`, undefined],
        ] as const) {
          const r = await rest(rol, metodo, ruta, cuerpo);
          if (![401, 403].includes(r.status)) malas.push(`${rol} ${metodo} ${t}: ${r.status}`);
        }
      }
    }
    expect(malas).toEqual([]);
  });
  it('SEC-03_los_datos_siguen_intactos_tras_los_intentos', async () => {
    const [{ n }] = await sql<{ n: string }>("select count(*)::text n from public.alumno where nombre = 'x'");
    expect(n).toBe('0');
  });
});

describe('SEC-04 privado fuera de la API', () => {
  it('SEC-04_pedir_el_esquema_privado_por_Accept_Profile_es_rechazado', async () => {
    const r = await rest('profesor', 'GET', 'ajustes?select=*', undefined, { 'Accept-Profile': 'privado' });
    expect([403, 404, 406]).toContain(r.status);
  });
  it('SEC-04_RPC_de_privado_no_alcanzable', async () => {
    const e = entorno();
    for (const fn of ['configurar_profesor', 'es_profesor', 'mi_alumno_id']) {
      const r = await fetch(`${e.apiUrl}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: e.anonKey, Authorization: `Bearer ${(await sesionDe('profesor')).accessToken}`, 'Content-Type': 'application/json', 'Content-Profile': 'privado' },
        body: '{}',
      });
      expect([403, 404, 406], `privado.${fn} => ${r.status}`).toContain(r.status);
    }
  });
  it('SEC-04_rpc_es_profesor_y_mi_alumno_id_dan_404_en_public', async () => {
    for (const fn of ['es_profesor', 'mi_alumno_id']) {
      const r = await rpc('profesor', fn);
      expect(r.status, `rpc/${fn}`).toBe(404);
    }
  });
  it('SEC-04_funciones_de_privado_tampoco_aparecen_en_public', async () => {
    const e = entorno();
    const r = await fetch(`${e.apiUrl}/rest/v1/rpc/configurar_profesor`, {
      method: 'POST',
      headers: { apikey: e.anonKey, Authorization: `Bearer ${e.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_mail: 'otro@example.test', p_nombre: 'X' }),
    });
    expect(r.status).toBe(404);
  });
});

describe('SEC-02 aislamiento por fila (alumno, persona_a_cargo, profesor)', () => {
  it('SEC-02_el_alumno_lee_solo_su_fila_de_alumno', async () => {
    const a = await sesionDe('alumno');
    const r = await rest('alumno', 'GET', 'alumno?select=id,user_id');
    expect(r.status).toBe(200);
    expect((r.cuerpo as { id: string }[]).map((f) => f.id)).toEqual([a.alumnoId]);
  });
  it('SEC-02_el_otro_alumno_lee_la_suya_y_no_la_ajena', async () => {
    const a = await sesionDe('alumno');
    const b = await sesionDe('alumnoB');
    const r = await rest('alumnoB', 'GET', `alumno?select=id&id=eq.${a.alumnoId}`);
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual([]);
    const propia = await rest('alumnoB', 'GET', `alumno?select=id&id=eq.${b.alumnoId}`);
    expect((propia.cuerpo as unknown[]).length).toBe(1);
  });
  it('SEC-02_el_alumno_no_ve_la_fila_del_profesor', async () => {
    const r = await rest('alumno', 'GET', 'profesor?select=*');
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual([]);
  });
  it('SEC-02_el_profesor_lee_su_fila_y_solo_los_alumnos_con_inscripcion_vigente_con_el', async () => {
    const p = await rest('profesor', 'GET', 'profesor?select=id,mail');
    expect((p.cuerpo as { mail: string }[]).map((f) => f.mail)).toEqual(['profesor@example.test']);
    const idA = await profesorId(SLUG_A);
    const esperados = (await sql<{ alumno_id: string }>("select alumno_id from public.inscripcion where profesor_id = $1 and estado <> 'baja'", [idA])).map((f) => f.alumno_id).sort();
    const a = await rest('profesor', 'GET', 'alumno?select=id');
    expect((a.cuerpo as { id: string }[]).map((f) => f.id).sort()).toEqual(esperados);
  });
  it('SEC-02_la_profesora_B_no_ve_la_fila_de_A_ni_a_la_alumna_de_A', async () => {
    const a = await sesionDe('alumno');
    const idA = await profesorId(SLUG_A);
    expect(((await rest('profesorB', 'GET', 'profesor?select=mail')).cuerpo as { mail: string }[]).map((f) => f.mail)).toEqual(['profesora.b@example.test']);
    expect((await rest('profesorB', 'GET', `alumno?select=id&id=eq.${a.alumnoId}`)).cuerpo).toEqual([]);
    expect((await rest('profesorB', 'GET', `inscripcion?select=alumno_id&profesor_id=eq.${idA}`)).cuerpo).toEqual([]);
  });
  it('SEC-02_el_Administrador_no_lee_filas_de_profesor_alumno_ni_inscripcion', async () => {
    for (const t of ['profesor', 'alumno', 'inscripcion', 'persona_a_cargo']) {
      const r = await rest('administrador', 'GET', `${t}?select=id`);
      expect(r.status, t).toBe(200);
      expect(r.cuerpo, t).toEqual([]);
    }
  });
  it('SEC-02_persona_a_cargo_ajena_no_se_ve', async () => {
    const a = await sesionDe('alumno');
    const [f] = await sql<{ id: string }>("insert into public.persona_a_cargo (alumno_id, nombre) values ($1, 'Hijo de prueba') returning id", [a.alumnoId]);
    try {
      expect(((await rest('alumno', 'GET', `persona_a_cargo?select=id&id=eq.${f.id}`)).cuerpo as unknown[]).length).toBe(1);
      expect((await rest('alumnoB', 'GET', `persona_a_cargo?select=id&id=eq.${f.id}`)).cuerpo).toEqual([]);
      expect((await rest('profesorB', 'GET', `persona_a_cargo?select=id&id=eq.${f.id}`)).cuerpo).toEqual([]);
      expect((await rest('administrador', 'GET', `persona_a_cargo?select=id&id=eq.${f.id}`)).cuerpo).toEqual([]);
      expect(((await rest('profesor', 'GET', `persona_a_cargo?select=id&id=eq.${f.id}`)).cuerpo as unknown[]).length).toBe(1);
    } finally {
      await sql('delete from public.persona_a_cargo where id = $1', [f.id]);
    }
  });
});
