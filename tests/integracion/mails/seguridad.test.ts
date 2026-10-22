// B03 · T03.4 · Seguridad de mails contra el stack local: SEC-11 (secreto, `ids`, CR/LF), SEC-17 (logs sin
// destinatario), SEC-28 (`barrer_mails` en `cron.job`), SEC-01/SEC-03/SEC-04 por la API (T-NFR-13) y NFR-07.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rest, rpc, sesionDe } from '../../soporte/usuarios';
import {
  confirmar,
  direccion,
  dormir,
  encolar,
  esperarEstado,
  esperarMailPara,
  insertarFila,
  invocar,
  limpiarFilas,
  logsDelEdgeRuntime,
  mailsPara,
  registrar,
  SECRETO_LOCAL,
} from './ayuda';

beforeAll(async () => {
  await limpiarFilas();
  await sesionDe('profesor');
  await sesionDe('alumno');
}, 300_000);
afterEach(limpiarFilas);
afterAll(async () => {
  await limpiarFilas();
  await cerrar();
});

describe('SEC-11 la función exige el secreto y valida `ids`', () => {
  it('SEC-11_sin_secreto_con_secreto_erroneo_o_vacio_es_401_y_la_fila_pendiente_no_se_toca', async () => {
    const id = await insertarFila({ estado: 'pendiente' }, true);
    const respuestas = {
      sinCabecera: await invocar({ ids: [id] }, {}),
      erroneo: await invocar({ ids: [id] }, { 'x-mail-secreto': 'secreto-equivocado' }),
      vacio: await invocar({ ids: [id] }, { 'x-mail-secreto': '' }),
      prefijo: await invocar({ ids: [id] }, { 'x-mail-secreto': SECRETO_LOCAL.slice(0, -1) }),
      ampliado: await invocar({ ids: [id] }, { 'x-mail-secreto': `${SECRETO_LOCAL}x` }),
    };
    const [fila] = await sql<{ estado: string; intentado_en: Date | null }>('select estado, intentado_en from public.mail_salida where id = $1', [id]);
    registrar('SEC-11_secreto', { ids: [id], secretos: ['ninguno', 'erroneo', 'vacio', 'prefijo', 'ampliado'] }, { status: Object.fromEntries(Object.entries(respuestas).map(([k, v]) => [k, v.status])), fila });
    for (const [k, r] of Object.entries(respuestas)) expect(r.status, k).toBe(401);
    expect(fila).toEqual({ estado: 'pendiente', intentado_en: null });
  });

  it('SEC-11_el_cuerpo_solo_acepta_ids_uuid_y_el_metodo_solo_POST', async () => {
    const casos: [string, unknown, number][] = [
      ['ids no es lista', { ids: 'abc' }, 400],
      ['id que no es uuid', { ids: ['no-es-uuid'] }, 400],
      ['id con inyección', { ids: ["00000000-0000-0000-0000-000000000000' or 1=1 --"] }, 400],
      ['ids con número', { ids: [1] }, 400],
      ['cuerpo no es objeto', [1, 2], 400],
      ['JSON roto', '{no es json', 400],
      ['demasiados ids', { ids: Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }, 400],
      ['lista vacía válida', { ids: [] }, 200],
    ];
    const salida: Record<string, number> = {};
    for (const [nombre, cuerpo, esperado] of casos) {
      const r = await invocar(cuerpo);
      salida[nombre] = r.status;
      expect(r.status, nombre).toBe(esperado);
    }
    const get = await invocar(undefined, { 'x-mail-secreto': SECRETO_LOCAL }, 'GET');
    registrar('SEC-11_ids', { casos: casos.map((c) => c[0]) }, { ...salida, GET: get.status });
    expect(get.status).toBe(405);
  });

  it('SEC-11_un_asunto_con_CR_LF_no_inyecta_cabeceras_y_sale_en_una_linea', async () => {
    const para = direccion('crlf');
    const id = await confirmar((c) => encolar(c, 'cuenta_nueva', para, 'Hola\r\nBcc: espia@example.test\r\nX-Inyectada: 1', 'cuerpo'));
    const mail = await esperarMailPara(para);
    await esperarEstado(id!, ['enviado']);
    const [fila] = await sql<{ asunto: string }>('select asunto from public.mail_salida where id = $1', [id]);
    registrar('SEC-11_CRLF_asunto', { asunto: 'Hola\\r\\nBcc: espia@example.test\\r\\nX-Inyectada: 1' }, { guardado: fila.asunto, subject: mail.Subject, bcc: mail.Bcc });
    expect(fila.asunto).not.toMatch(/[\r\n]/);
    expect(mail.Subject).not.toMatch(/[\r\n]/);
    expect(mail.Subject).toBe('Hola Bcc: espia@example.test X-Inyectada: 1');
    expect(mail.Bcc ?? []).toHaveLength(0);
    expect(mail.To.map((t) => t.Address)).toEqual([para]);
    expect(await mailsPara('espia@example.test')).toHaveLength(0);
  });

  it('H-141_SEC-11_NFR-07_un_destinatario_con_CR_LF_o_dos_direcciones_nace_fallido_DESTINATARIO_INVALIDO_sin_mail_y_la_operacion_se_confirma', async () => {
    const base = direccion('inyec');
    const operacion = direccion('operacion');
    const malos = [`${base}\r\nBcc: espia@example.test`, `${base}, espia@example.test`, `${base};espia@example.test`, `Nombre <${base}>`];
    const ids = await confirmar(async (c) => {
      const encolados: (string | null)[] = [];
      for (const m of malos) encolados.push(await encolar(c, 'cuenta_nueva', m, 'x', 'c'));
      // «La operación»: lo que el negocio escribió en la misma transacción y debe sobrevivir (NFR-07).
      await c.query("insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado) values ((select id from public.profesor), 'recordatorio', $1, 'operacion', 'c', 'enviado')", [operacion]);
      return encolados;
    });
    try {
      await dormir(2000);
      const filas = await sql<{ estado: string; motivo_fallo: string | null; destinatario: string; intentado_en: Date | null }>(
        'select estado, motivo_fallo, destinatario, intentado_en from public.mail_salida where id = any($1::uuid[])', [ids]);
      const registro = await sql<{ motivo: string }>('select motivo from public.v_mails_fallidos where id = any($1::uuid[])', [ids]);
      const op = await sql('select 1 from public.mail_salida where destinatario = $1', [operacion]);
      const espia = await mailsPara('espia@example.test');
      registrar('H-141_SEC-11_destinatario_invalido', { destinatarios: malos }, { filas, registro, operacion: op.length, mailsEspia: espia.length });
      expect(ids.every((id) => id !== null)).toBe(true);
      expect(filas).toHaveLength(malos.length);
      for (const f of filas) {
        expect(f).toMatchObject({ estado: 'fallido', motivo_fallo: 'DESTINATARIO_INVALIDO', intentado_en: null });
        expect(f.destinatario).not.toMatch(/[\r\n]/);
      }
      expect(registro).toEqual(malos.map(() => ({ motivo: 'DESTINATARIO_INVALIDO' })));
      expect(op, 'la operación que encoló quedó confirmada').toHaveLength(1);
      expect(espia).toHaveLength(0);
      expect(await mailsPara(base)).toHaveLength(0);
    } finally {
      // `Nombre <…>` no empieza con el prefijo que borra `limpiarFilas`.
      await sql('delete from public.mail_salida where id = any($1::uuid[])', [ids]);
    }
  });
});

describe('SEC-17 los logs de la función no traen el destinatario', () => {
  it('SEC-17_tras_un_envio_real_el_log_del_edge_runtime_solo_tiene_id_y_resultado', async () => {
    const para = direccion('logsreales');
    const id = await confirmar((c) => encolar(c, 'cuenta_nueva', para, 'Asunto-centinela-logs', 'Cuerpo-centinela-logs'));
    await esperarMailPara(para);
    await esperarEstado(id!, ['enviado']);
    await dormir(500);
    const logs = logsDelEdgeRuntime();
    const lineasMail = logs.split('\n').filter((l) => l.includes(id!));
    registrar('SEC-17_logs_reales', { destinatario: para, id }, { lineas: lineasMail });
    expect(lineasMail.some((l) => l.includes('"resultado":"enviado"'))).toBe(true);
    for (const prohibido of [para, para.split('@')[0], 'Asunto-centinela-logs', 'Cuerpo-centinela-logs']) {
      expect(logs, `el log trae «${prohibido}»`).not.toContain(prohibido);
    }
  });

  it('SEC-17_la_cola_de_pg_net_lleva_solo_ids', async () => {
    const para = direccion('cola');
    const c = await (await import('../../soporte/bd')).conectar();
    await c.query('begin');
    try {
      const id = await encolar(c, 'cuenta_nueva', para, 'Asunto-cola', 'Cuerpo-cola');
      const r = await c.query<{ body: string }>("select convert_from(body, 'UTF8') as body from net.http_request_queue where convert_from(body, 'UTF8') like '%' || $1 || '%'", [id]);
      registrar('SEC-17_cola', { destinatario: para }, { cuerpos: r.rows.map((x) => x.body) });
      expect(r.rows).toHaveLength(1);
      expect(JSON.parse(r.rows[0].body)).toEqual({ ids: [id] });
    } finally {
      await c.query('rollback');
    }
  });
});

describe('SEC-28 barrer_mails en pg_cron', () => {
  it('SEC-28_cron_job_tiene_barrer_mails_activo_cada_5_min_y_la_API_no_toca_cron', async () => {
    const [job] = await sql<{ schedule: string; command: string; active: boolean }>("select schedule, command, active from cron.job where jobname = 'barrer_mails'");
    const [perm] = await sql<{ anon: boolean; auth: boolean }>("select has_schema_privilege('anon', 'cron', 'usage') as anon, has_schema_privilege('authenticated', 'cron', 'usage') as auth");
    registrar('SEC-28', { consulta: 'cron.job barrer_mails' }, { job, perm });
    expect(job).toEqual({ schedule: '*/5 * * * *', command: 'select privado.barrer_mails()', active: true });
    expect(perm).toEqual({ anon: false, auth: false });
  });
});

describe('SEC-01 / SEC-03 / SEC-04 / T-NFR-13 mails por la API', () => {
  it('SEC-01_T-NFR-13_anon_no_lee_alumno_ve_cero_filas_y_el_profesor_lee_solo_columnas_del_registro', async () => {
    const para = direccion('visible');
    await insertarFila({ estado: 'fallido', motivo: 'TOPE', destinatario: para }, true);
    const anonTabla = await rest('anon', 'GET', 'mail_salida?select=id');
    const anonVista = await rest('anon', 'GET', 'v_mails_fallidos?select=id');
    const alumnoVista = await rest('alumno', 'GET', 'v_mails_fallidos?select=id');
    const alumnoTabla = await rest('alumno', 'GET', 'mail_salida?select=id');
    const profVista = await rest('profesor', 'GET', `v_mails_fallidos?destinatario=eq.${encodeURIComponent(para)}&select=*`);
    const profCuerpo = await rest('profesor', 'GET', 'mail_salida?select=cuerpo_texto');
    const profAsunto = await rest('profesor', 'GET', 'mail_salida?select=asunto');
    const profColumnas = await rest('profesor', 'GET', `mail_salida?destinatario=eq.${encodeURIComponent(para)}&select=id,tipo,destinatario,estado,motivo_fallo,creado_en`);
    registrar('T-NFR-13_API', { rol: ['anon', 'alumno', 'profesor'] }, { anon: [anonTabla.status, anonVista.status], alumno: [alumnoVista.status, alumnoVista.cuerpo, alumnoTabla.cuerpo], profesor: [profVista.cuerpo, profCuerpo.status, profAsunto.status] });
    expect([401, 403]).toContain(anonTabla.status);
    expect([401, 403]).toContain(anonVista.status);
    expect(alumnoVista.status).toBe(200);
    expect(alumnoVista.cuerpo).toEqual([]);
    expect(alumnoTabla.cuerpo).toEqual([]);
    expect(profVista.status).toBe(200);
    expect(profVista.cuerpo as unknown[]).toHaveLength(1);
    expect(Object.keys((profVista.cuerpo as Record<string, unknown>[])[0]).sort()).toEqual(['destinatario', 'fecha', 'id', 'motivo', 'tipo']);
    expect([401, 403]).toContain(profCuerpo.status);
    expect([401, 403]).toContain(profAsunto.status);
    expect(profColumnas.status).toBe(200);
    expect(profColumnas.cuerpo as unknown[]).toHaveLength(1);
  });

  it('SEC-03_SEC-04_ningun_rol_escribe_mail_salida_ni_llama_a_las_funciones_de_privado', async () => {
    const fallos: string[] = [];
    for (const rol of ['anon', 'alumno', 'profesor'] as const) {
      const post = await rest(rol, 'POST', 'mail_salida', { tipo: 'cuenta_nueva' });
      const patch = await rest(rol, 'PATCH', 'mail_salida?id=not.is.null', { estado: 'enviado' });
      const del = await rest(rol, 'DELETE', 'mail_salida?id=not.is.null');
      for (const [n, r] of [['POST', post], ['PATCH', patch], ['DELETE', del]] as const) if (![401, 403].includes(r.status)) fallos.push(`${rol} ${n} ${r.status}`);
      for (const f of ['encolar_mail', 'barrer_mails', 'disparar_mail']) {
        const r = await rpc(rol, f, {});
        if (![401, 403, 404].includes(r.status)) fallos.push(`${rol} rpc ${f} ${r.status}`);
      }
    }
    registrar('SEC-03_SEC-04', { roles: ['anon', 'alumno', 'profesor'] }, { fallos });
    expect(fallos).toEqual([]);
  });
});
