// B03 · T03.4 · Encolado → Mailpit, rollback sin mail y tope de AVI-08 contra el stack local con la Edge Function
// `enviar-mail` real (trigger pg_net). Casos: T-AVI-10 (CA-33), T-NFR-13/T-NFR-14 rama de registro (CA-34, NFR-07),
// CA-42 (AVI-08, SEC-10). Las filas de prueba llevan el prefijo `t03.` y se limpian; el barrido de 5 min no las toca
// porque cada prueba las lleva a un estado final en segundos. El reloj de los casos de ventana se fija DENTRO de una
// transacción que se deshace (el stack es compartido): nada del reloj ni de esas filas se confirma.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import {
  confirmar,
  conRelojEnTransaccion,
  cuentaDelTope,
  direccion,
  dormir,
  encolar,
  esperarEstado,
  esperarMailPara,
  insertarFila,
  limpiarFilas,
  mailsPara,
  registrar,
  REMITENTE_LOCAL,
} from './ayuda';

beforeAll(limpiarFilas);
afterEach(limpiarFilas);
afterAll(async () => {
  await limpiarFilas();
  await cerrar();
});

describe('CA-33 / AVI-07 encolado → Mailpit con remitente', () => {
  for (const tipo of ['cuenta_nueva', 'solicitud_nueva', 'recordatorio']) {
    it(`CA-33_T-AVI-10_${tipo}_sale_por_smtp_con_remitente_la_casilla_del_profesor`, async () => {
      const para = direccion(tipo);
      const asunto = `Asunto ${tipo}`;
      const id = await confirmar((c) => encolar(c, tipo, para, asunto, `Cuerpo de ${tipo}`));
      const mail = await esperarMailPara(para);
      const fila = await esperarEstado(id!, ['enviado', 'fallido']);
      registrar(`CA-33_${tipo}`, { tipo, destinatario: para, asunto }, { from: mail.From, subject: mail.Subject, estado: fila.estado });
      expect(mail.From.Address).toBe(REMITENTE_LOCAL);
      expect(mail.To.map((t) => t.Address)).toEqual([para]);
      expect(mail.Subject).toBe(asunto);
      expect(mail.Text).toContain(`Cuerpo de ${tipo}`);
      expect(fila).toEqual({ estado: 'enviado', motivo_fallo: null });
      const [f] = await sql<{ enviado_en: Date | null }>('select enviado_en from public.mail_salida where id = $1', [id]);
      expect(f.enviado_en).not.toBeNull();
    });
  }
});

describe('NFR-07 / ADR-005 un rollback no deja mail', () => {
  it('NFR-07_si_la_transaccion_se_revierte_no_hay_fila_ni_mail', async () => {
    const para = direccion('rollback');
    let id: string | null = null;
    await expect(
      confirmar(async (c) => {
        id = await encolar(c, 'cuenta_nueva', para, 'No debe salir', 'cuerpo');
        throw new Error('la operación de negocio falla');
      }),
    ).rejects.toThrow('la operación de negocio falla');
    await dormir(4000);
    const filas = await sql('select 1 from public.mail_salida where destinatario = $1', [para]);
    const mails = await mailsPara(para);
    registrar('NFR-07_rollback', { destinatario: para, idEncolado: id }, { filas: filas.length, mails: mails.length });
    expect(id).not.toBeNull();
    expect(filas).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });
});

describe('CA-42 / AVI-08 / SEC-10 tope de mails con la función real', () => {
  it('CA-42_con_20_en_la_hora_el_21_nace_fallido_TOPE_sin_llamar_a_la_funcion_y_la_operacion_se_confirma', async () => {
    const previo = await cuentaDelTope();
    expect(previo.hora, 'el stack tiene demasiados mails vivos para esta prueba').toBeLessThanOrEqual(19);
    for (let i = 0; i < 19 - previo.hora; i++) await insertarFila({ estado: 'enviado' }, true);
    const veinte = direccion('veinte');
    const veintiuno = direccion('veintiuno');
    const operacion = direccion('operacion');
    const ids = await confirmar(async (c) => {
      const a = await encolar(c, 'recordatorio', veinte, 'Mail 20', 'cuerpo');
      const b = await encolar(c, 'recordatorio', veintiuno, 'Mail 21', 'cuerpo');
      // «La operación»: lo que el negocio escribió en la misma transacción y debe sobrevivir al tope.
      await c.query("insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado) values ((select id from public.profesor), 'recordatorio', $1, 'operacion', 'c', 'enviado')", [operacion]);
      return { a, b };
    });
    // El 20 pasa por la función; con eso ya se sabe que la función estaba atendiendo cuando el 21 se encoló.
    const mail20 = await esperarMailPara(veinte);
    await esperarEstado(ids.a!, ['enviado']);
    await dormir(3000);
    const [f21] = await sql<{ estado: string; motivo_fallo: string | null; intentado_en: Date | null }>('select estado, motivo_fallo, intentado_en from public.mail_salida where id = $1', [ids.b]);
    const mails21 = await mailsPara(veintiuno);
    const [op] = await sql('select 1 from public.mail_salida where destinatario = $1', [operacion]);
    const registro = await sql('select motivo from public.v_mails_fallidos where destinatario = $1', [veintiuno]);
    registrar('CA-42_hora', { previo, mail20: veinte, mail21: veintiuno }, { f21, mails21: mails21.length, registro, asunto20: mail20.Subject });
    expect(f21.estado).toBe('fallido');
    expect(f21.motivo_fallo).toBe('TOPE');
    expect(f21.intentado_en, 'la función no reclamó la fila (no hubo llamada)').toBeNull();
    expect(mails21).toHaveLength(0);
    expect(op, 'la operación que encoló quedó confirmada').toBeDefined();
    expect(registro).toEqual([{ motivo: 'TOPE' }]);
  });

  it('CA-42_con_200_en_24_h_el_201_nace_fallido_TOPE_y_el_200_pasa', async () => {
    const previo = await cuentaDelTope();
    expect(previo.hora, 'el stack tiene mails vivos en la hora').toBe(0);
    expect(previo.dia).toBeLessThanOrEqual(199);
    // 199 en el día, hace 3 h (no cuentan para la hora).
    await sql(
      `insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
       select (select id from public.profesor), 'recordatorio', $1 || g || '@example.test', 'dia', 'c', 'enviado', public.app_ahora() - interval '3 hours' - (g || ' seconds')::interval
         from generate_series(1, $2::int) g`,
      [`${direccion('dia').split('@')[0]}.`, 199 - previo.dia],
    );
    const dosc = direccion('d200');
    const dosc1 = direccion('d201');
    const ids = await confirmar(async (c) => ({
      a: await encolar(c, 'recordatorio', dosc, 'Mail 200', 'c'),
      b: await encolar(c, 'recordatorio', dosc1, 'Mail 201', 'c'),
    }));
    await esperarMailPara(dosc);
    await dormir(3000);
    const [f] = await sql<{ estado: string; motivo_fallo: string | null; intentado_en: Date | null }>('select estado, motivo_fallo, intentado_en from public.mail_salida where id = $1', [ids.b]);
    const mails = await mailsPara(dosc1);
    registrar('CA-42_dia', { previo, mail200: dosc, mail201: dosc1 }, { f, mails201: mails.length });
    expect(f.estado).toBe('fallido');
    expect(f.motivo_fallo).toBe('TOPE');
    expect(f.intentado_en).toBeNull();
    expect(mails).toHaveLength(0);
  });

  it('CA-42_reloj_fijo_las_filas_TOPE_no_cuentan_y_fuera_de_la_ventana_vuelve_a_encolar', async () => {
    const salida = await conRelojEnTransaccion('2031-03-03T15:00:00Z', async (c) => {
      const estados: string[] = [];
      for (let i = 1; i <= 22; i++) {
        const id = await encolar(c, 'recordatorio', `t03.reloj${i}@example.test`, 'tope', 'c');
        estados.push((await c.query<{ e: string }>("select estado || coalesce('/' || motivo_fallo, '') as e from public.mail_salida where id = $1", [id])).rows[0].e);
      }
      await c.query("update privado.reloj_prueba set ahora = '2031-03-03T15:59:00Z'");
      const id59 = await encolar(c, 'recordatorio', 't03.reloj59@example.test', 'tope', 'c');
      const e59 = (await c.query<{ e: string }>("select estado || coalesce('/' || motivo_fallo, '') as e from public.mail_salida where id = $1", [id59])).rows[0].e;
      await c.query("update privado.reloj_prueba set ahora = '2031-03-03T16:00:01Z'");
      const id60 = await encolar(c, 'recordatorio', 't03.reloj60@example.test', 'tope', 'c');
      const e60 = (await c.query<{ e: string }>("select estado || coalesce('/' || motivo_fallo, '') as e from public.mail_salida where id = $1", [id60])).rows[0].e;
      // Día: 200 filas a las 12:00 (3 h antes) y recién entonces el día está lleno; a las 24 h y 1 min vuelve.
      await c.query("update privado.reloj_prueba set ahora = '2031-03-10T15:00:00Z'");
      await c.query(
        `insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
         select (select id from public.profesor), 'recordatorio', 't03.dia' || g || '@example.test', 'dia', 'c', 'enviado', '2031-03-10T12:00:00Z'::timestamptz - (g || ' seconds')::interval from generate_series(1, 200) g`,
      );
      const idDia = await encolar(c, 'recordatorio', 't03.diatope@example.test', 'dia', 'c');
      const eDia = (await c.query<{ e: string }>("select estado || coalesce('/' || motivo_fallo, '') as e from public.mail_salida where id = $1", [idDia])).rows[0].e;
      await c.query("update privado.reloj_prueba set ahora = '2031-03-11T12:00:01Z'");
      const idFuera = await encolar(c, 'recordatorio', 't03.diafuera@example.test', 'dia', 'c');
      const eFuera = (await c.query<{ e: string }>("select estado || coalesce('/' || motivo_fallo, '') as e from public.mail_salida where id = $1", [idFuera])).rows[0].e;
      return { estados, e59, e60, eDia, eFuera };
    });
    registrar('CA-42_reloj_fijo', { instantes: ['2031-03-03T15:00Z', '+59 min', '+60 min 1 s', '2031-03-10T15:00Z con 200 en el día', '+24 h 1 min'] }, salida);
    expect(salida.estados.slice(0, 20).every((e) => e === 'pendiente')).toBe(true);
    expect(salida.estados.slice(20)).toEqual(['fallido/TOPE', 'fallido/TOPE']);
    expect(salida.e59).toBe('fallido/TOPE');
    expect(salida.e60).toBe('pendiente');
    expect(salida.eDia).toBe('fallido/TOPE');
    expect(salida.eFuera).toBe('pendiente');
  });
});
