// B03 · T03.4 · Fallos de envío: credenciales SMTP inválidas dejan la fila `fallido` con motivo y visible para el
// profesor (rama de registro de CA-34, T-NFR-13; la rama de confirmar una solicitud cierra en B07), `enviando` vieja
// → `SIN_CONFIRMACION` (H-017) y logs sin destinatario (SEC-17).
// La `enviar-mail` real corre con Deno en un puerto local contra un SMTP falso que contesta 535 al AUTH, y contra la
// base del stack con la clave de servicio leída del contenedor del edge runtime (nunca se escribe en disco).
import { type ChildProcess, spawn, execSync } from 'node:child_process';
import net from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, conectar, sql } from '../../soporte/bd';
import { entorno, RAIZ } from '../../soporte/entorno';
import { rest, sesionDe } from '../../soporte/usuarios';
import { claveDeServicioLocal, direccion, dormir, insertarFila, invocar, limpiarFilas, logsDelEdgeRuntime, registrar, SECRETO_LOCAL } from './ayuda';

const PUERTO_FUNCION = 54399;
let smtp: net.Server;
let puertoSmtp = 0;
let intentosAuth = 0;
let deno: ChildProcess;
let salidaDeno = '';

function iniciarSmtpQueRechazaCredenciales(): Promise<void> {
  smtp = net.createServer((s) => {
    s.write('220 localhost ESMTP prueba\r\n');
    let resto = '';
    s.on('data', (d) => {
      resto += d.toString();
      let i: number;
      while ((i = resto.indexOf('\r\n')) >= 0) {
        const linea = resto.slice(0, i);
        resto = resto.slice(i + 2);
        if (/^EHLO/i.test(linea)) s.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH/i.test(linea)) {
          intentosAuth++;
          s.write('535 5.7.8 Username and Password not accepted\r\n');
        } else if (/^QUIT/i.test(linea)) s.end('221 bye\r\n');
        else s.write('250 OK\r\n');
      }
    });
    s.on('error', () => undefined);
  });
  return new Promise((ok) => smtp.listen(0, '127.0.0.1', () => {
    puertoSmtp = (smtp.address() as net.AddressInfo).port;
    ok();
  }));
}

async function iniciarFuncionLocal(): Promise<void> {
  const env = {
    ...process.env,
    PUERTO_FUNCION: String(PUERTO_FUNCION),
    MAIL_SECRETO: SECRETO_LOCAL,
    GMAIL_USER: 'local@ejemplo.test',
    GMAIL_APP_PASSWORD: 'clave-invalida-de-prueba',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(puertoSmtp),
    SMTP_TLS: 'false',
    SUPABASE_URL: entorno().apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: claveDeServicioLocal(),
  };
  deno = spawn('npx', ['--yes', 'deno@2.1.4', 'run', '-A', '--no-prompt', '--node-modules-dir=none', 'tests/integracion/mails/servidor-local.ts'], { cwd: RAIZ, env, shell: true });
  deno.stdout?.on('data', (d) => (salidaDeno += d.toString()));
  deno.stderr?.on('data', (d) => (salidaDeno += d.toString()));
  for (let i = 0; i < 240 && !salidaDeno.includes('LISTO'); i++) await dormir(500);
  if (!salidaDeno.includes('LISTO')) throw new Error(`La función local no arrancó:\n${salidaDeno}`);
}

beforeAll(async () => {
  await limpiarFilas();
  await iniciarSmtpQueRechazaCredenciales();
  await iniciarFuncionLocal();
  await sesionDe('profesor');
  await sesionDe('alumno');
}, 400_000);
afterEach(limpiarFilas);
afterAll(async () => {
  if (deno?.pid) {
    try {
      execSync(process.platform === 'win32' ? `taskkill /pid ${deno.pid} /T /F` : `kill -9 ${deno.pid}`, { stdio: 'ignore' });
    } catch {
      /* ya terminó */
    }
  }
  smtp?.close();
  await limpiarFilas();
  await cerrar();
});

const URL_LOCAL = `http://127.0.0.1:${PUERTO_FUNCION}/`;

describe('CA-34 rama de registro: credenciales inválidas', () => {
  it('CA-34_T-NFR-13_con_credenciales_invalidas_la_fila_queda_fallido_con_motivo_y_el_profesor_la_ve', async () => {
    const para = direccion('credenciales');
    // Sin disparo de pg_net: así solo la función local (SMTP que rechaza) procesa la fila.
    const id = await insertarFila({ estado: 'pendiente', destinatario: para }, true);
    const r = await invocar({ ids: [id] }, { 'x-mail-secreto': SECRETO_LOCAL }, 'POST', URL_LOCAL);
    const [fila] = await sql<{ estado: string; motivo_fallo: string | null }>('select estado, motivo_fallo from public.mail_salida where id = $1', [id]);
    const vistaProfesor = await rest('profesor', 'GET', `v_mails_fallidos?destinatario=eq.${encodeURIComponent(para)}&select=id,fecha,destinatario,tipo,motivo`);
    const vistaAlumno = await rest('alumno', 'GET', `v_mails_fallidos?destinatario=eq.${encodeURIComponent(para)}&select=id`);
    registrar('CA-34_credenciales_invalidas', { smtp: 'falso 535', destinatario: para, ids: [id] }, { respuesta: r.json, fila, vistaProfesor: vistaProfesor.cuerpo, vistaAlumno: vistaAlumno.cuerpo, intentosAuth });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ enviados: 0, fallidos: 1 });
    expect(intentosAuth).toBeGreaterThanOrEqual(1);
    expect(fila.estado).toBe('fallido');
    expect(fila.motivo_fallo).toMatch(/535|not accepted|Invalid login/i);
    expect(vistaProfesor.status).toBe(200);
    const filas = vistaProfesor.cuerpo as { destinatario: string; tipo: string; motivo: string; fecha: string }[];
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ destinatario: para, tipo: 'recordatorio' });
    expect(filas[0].motivo).toBe(fila.motivo_fallo);
    expect(Number.isNaN(Date.parse(filas[0].fecha))).toBe(false);
    expect(vistaAlumno.cuerpo).toEqual([]);
  });

  it('SEC-17_los_logs_de_la_funcion_no_traen_destinatario_asunto_ni_motivo', async () => {
    const para = direccion('logs');
    const id = await insertarFila({ estado: 'pendiente', destinatario: para }, true);
    await invocar({ ids: [id] }, { 'x-mail-secreto': SECRETO_LOCAL }, 'POST', URL_LOCAL);
    await dormir(500);
    const edge = logsDelEdgeRuntime();
    registrar('SEC-17_logs', { destinatario: para }, { lineasDenoLocal: salidaDeno.split('\n').filter((l) => l.includes('"evento"')).slice(-3), apareceEnLogsDelStack: edge.includes(para.split('@')[0]) });
    expect(salidaDeno).toContain(`"id":"${id}"`);
    expect(salidaDeno).toContain('"resultado":"fallido"');
    for (const prohibido of [para, para.split('@')[0], 'fila sintetica', 'cuerpo sintetico', 'not accepted', 'clave-invalida-de-prueba']) {
      expect(salidaDeno, `el log local trae «${prohibido}»`).not.toContain(prohibido);
      expect(edge, `el log del edge runtime trae «${prohibido}»`).not.toContain(prohibido);
    }
  });
});

describe('H-017 enviando vieja → SIN_CONFIRMACION', () => {
  it('H-017_el_barrido_pasa_enviando_de_mas_de_10_min_a_fallido_SIN_CONFIRMACION_sin_reintento', async () => {
    const vieja = await insertarFila({ estado: 'enviando', creadoEn: new Date(Date.now() - 20 * 60_000).toISOString(), intentadoEn: new Date(Date.now() - 11 * 60_000).toISOString() }, true);
    const reciente = await insertarFila({ estado: 'enviando', creadoEn: new Date(Date.now() - 20 * 60_000).toISOString(), intentadoEn: new Date(Date.now() - 9 * 60_000).toISOString() }, true);
    const c = await conectar();
    await c.query('begin'); // el barrido también redispara pendientes ajenas: se deshace para no tocar el stack compartido
    try {
      const antes = Number((await c.query<{ n: string }>('select count(*) as n from net.http_request_queue')).rows[0].n);
      const r = await c.query<{ r: { sin_confirmacion: number } }>('select privado.barrer_mails() as r');
      const filas = (await c.query<{ id: string; estado: string; motivo_fallo: string | null }>('select id, estado, motivo_fallo from public.mail_salida where id = any($1)', [[vieja, reciente]])).rows;
      const despues = Number((await c.query<{ n: string }>('select count(*) as n from net.http_request_queue')).rows[0].n);
      const colaConVieja = Number((await c.query<{ n: string }>("select count(*) as n from net.http_request_queue where convert_from(body, 'UTF8') like '%' || $1 || '%'", [vieja])).rows[0].n);
      registrar('H-017_SIN_CONFIRMACION', { enviando_hace_min: [11, 9] }, { resultado: r.rows[0].r, filas, llamadasNuevas: despues - antes });
      expect(r.rows[0].r.sin_confirmacion).toBeGreaterThanOrEqual(1);
      expect(filas.find((f) => f.id === vieja)).toMatchObject({ estado: 'fallido', motivo_fallo: 'SIN_CONFIRMACION' });
      expect(filas.find((f) => f.id === reciente)).toMatchObject({ estado: 'enviando', motivo_fallo: null });
      expect(colaConVieja, 'SIN_CONFIRMACION no se reintenta (pudo salir, DEC-10 b)').toBe(0);
    } finally {
      await c.query('rollback');
    }
  });
});
