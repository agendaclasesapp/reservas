// B03 · T03.4 · Encolado → Mailpit, rollback sin mail y tope de AVI-08 contra el stack local con la Edge Function
// `enviar-mail` real (trigger pg_net). Casos: T-AVI-10 (CA-33), T-NFR-13/T-NFR-14 rama de registro (CA-34, NFR-07),
// CA-42 (AVI-08, SEC-10). Las filas de prueba llevan el prefijo `t03.` y se limpian; el barrido de 5 min no las toca
// porque cada prueba las lleva a un estado final en segundos. El reloj de los casos de ventana se fija DENTRO de una
// transacción que se deshace (el stack es compartido): nada del reloj ni de esas filas se confirma.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { rest, SLUG_A, SLUG_B } from '../../soporte/usuarios';
import {
  confirmar,
  conRelojEnTransaccion,
  cuentaDelTope,
  DE,
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

describe('CA-33 / AVI-07 / CA-58 encolado → Mailpit con remitente y Reply-To', () => {
  // AVI-07: los avisos al profesor salen con el nombre del servicio y sin Reply-To; los del profesor a su alumno,
  // con su nombre y Reply-To a su mail (instantánea al encolar). La casilla (address) es siempre la de la app.
  const DE_PROFESOR = ['cuenta_nueva', 'solicitud_nueva'];
  for (const tipo of ['cuenta_nueva', 'solicitud_nueva', 'recordatorio']) {
    it(`CA-33_CA-58_T-AVI-10_${tipo}_sale_por_smtp_desde_la_casilla_de_la_app_con_el_nombre_que_corresponde`, async () => {
      const para = direccion(tipo);
      const asunto = `Asunto ${tipo}`;
      const id = await confirmar((c) => encolar(c, tipo, para, asunto, `Cuerpo de ${tipo}`));
      const mail = await esperarMailPara(para);
      const fila = await esperarEstado(id!, ['enviado', 'fallido']);
      registrar(`CA-33_${tipo}`, { tipo, destinatario: para, asunto }, { from: mail.From, subject: mail.Subject, estado: fila.estado });
      expect(mail.From.Address).toBe(REMITENTE_LOCAL);
      if (DE_PROFESOR.includes(tipo)) {
        expect(mail.From.Name).toBe('Agenda Clases App'); // WEB-12 / CA-65
        expect(mail.ReplyTo ?? []).toHaveLength(0);
      } else {
        expect(mail.From.Name).toBe('Profesor de Prueba');
        expect((mail.ReplyTo ?? []).map((r) => r.Address)).toEqual(['profesor@example.test']);
      }
      expect(mail.To.map((t) => t.Address)).toEqual([para]);
      expect(mail.Subject).toBe(asunto);
      expect(mail.Text).toContain(`Cuerpo de ${tipo}`);
      expect(fila).toEqual({ estado: 'enviado', motivo_fallo: null });
      const [f] = await sql<{ enviado_en: Date | null }>('select enviado_en from public.mail_salida where id = $1', [id]);
      expect(f.enviado_en).not.toBeNull();
    });
  }
});

describe('CA-58 el remitente sale del profesor de la fila (dos profesores)', () => {
  it('CA-58_un_mail_de_la_profesora_B_sale_con_su_nombre_y_su_Reply-To_y_no_los_de_A', async () => {
    const para = direccion('deb');
    const id = await confirmar((c) => encolar(c, 'recordatorio', para, 'De B', 'cuerpo', null, SLUG_B));
    const mail = await esperarMailPara(para);
    await esperarEstado(id!, ['enviado']);
    registrar('CA-58_B', { slug: SLUG_B, destinatario: para }, { from: mail.From, replyTo: mail.ReplyTo });
    expect(mail.From.Address).toBe(REMITENTE_LOCAL);
    expect(mail.From.Name).toBe('Profesora B de Prueba');
    expect((mail.ReplyTo ?? []).map((r) => r.Address)).toEqual(['profesora.b@example.test']);
  });

  it('CA-58_la_fila_guarda_remitente_y_responder_a_como_instantanea_aunque_el_profesor_cambie_de_nombre', async () => {
    const para = direccion('snap');
    const id = await confirmar((c) => encolar(c, 'clase_creada', para, 'Snap', 'cuerpo'));
    await sql(`update public.profesor set nombre = 'Nombre Cambiado' where id = ${DE(SLUG_A)}`);
    try {
      const [f] = await sql<{ remitente_nombre: string; responder_a: string }>('select remitente_nombre, responder_a from public.mail_salida where id = $1', [id]);
      expect(f).toEqual({ remitente_nombre: 'Profesor de Prueba', responder_a: 'profesor@example.test' });
    } finally {
      await sql(`update public.profesor set nombre = 'Profesor de Prueba' where id = ${DE(SLUG_A)}`);
    }
  });

  it('CA-58_un_nombre_con_comillas_menor_mayor_o_saltos_se_sanea_en_el_encabezado_From', async () => {
    const para = direccion('nom');
    await sql(`update public.profesor set nombre = 'Prof "X" <y@z.test>' where id = ${DE(SLUG_B)}`);
    try {
      const id = await confirmar((c) => encolar(c, 'recordatorio', para, 'Nombre raro', 'cuerpo', null, SLUG_B));
      const mail = await esperarMailPara(para);
      await esperarEstado(id!, ['enviado']);
      expect(mail.From.Address).toBe(REMITENTE_LOCAL);
      expect(mail.From.Name).not.toMatch(/["<>]/);
      expect(mail.From.Name).toContain('Prof');
    } finally {
      await sql(`update public.profesor set nombre = 'Profesora B de Prueba' where id = ${DE(SLUG_B)}`);
    }
  });
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
      await c.query("insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado) values ((select id from public.profesor where slug = 'profesor-prueba'), 'recordatorio', $1, 'operacion', 'c', 'enviado')", [operacion]);
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
    // H-251: independiente del estado del stack. Los mails vivos que dejan otras pruebas (B04/B05) cuentan en la hora;
    // basta que el 200 (y el 201) no choquen con el tope horario, de modo que el 201 solo falle por el tope diario.
    expect(previo.hora, 'el stack tiene demasiados mails vivos en la hora para aislar el tope diario').toBeLessThanOrEqual(18);
    expect(previo.dia).toBeLessThanOrEqual(199);
    // 199 en el día, hace 3 h (no cuentan para la hora).
    await sql(
      `insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
       select ${DE(SLUG_A)}, 'recordatorio', $1 || g || '@example.test', 'dia', 'c', 'enviado', public.app_ahora() - interval '3 hours' - (g || ' seconds')::interval
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
         select ${DE(SLUG_A)}, 'recordatorio', 't03.dia' || g || '@example.test', 'dia', 'c', 'enviado', '2031-03-10T12:00:00Z'::timestamptz - (g || ' seconds')::interval from generate_series(1, 200) g`,
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

describe('CA-60 / SEC-10 tope por profesor y tope global de la aplicación', () => {
  const T0 = '2031-04-07T15:00:00Z';
  const estadoDe = async (c: import('pg').Client, id: string | null) =>
    (await c.query<{ e: string }>("select estado || coalesce('/' || motivo_fallo, '') as e from public.mail_salida where id = $1", [id])).rows[0].e;
  const rellenar = (c: import('pg').Client, slug: string, n: number, hace: string) =>
    c.query(
      `insert into public.mail_salida (profesor_id, tipo, destinatario, asunto, cuerpo_texto, estado, creado_en)
       select ${DE(slug)}, 'recordatorio', 't03.relleno' || $1 || g || '@example.test', 'r', 'c', 'enviado', $2::timestamptz - $3::interval - (g || ' seconds')::interval
         from generate_series(1, $4::int) g`,
      [slug, T0, hace, n],
    );

  it('CA-60_el_tope_de_20_por_hora_de_A_no_frena_a_B', async () => {
    const salida = await conRelojEnTransaccion(T0, async (c) => {
      await rellenar(c, SLUG_A, 20, '10 minutes');
      const a = await encolar(c, 'recordatorio', 't03.topeA@example.test', 'a', 'c', null, SLUG_A);
      const b = await encolar(c, 'recordatorio', 't03.topeB@example.test', 'b', 'c', null, SLUG_B);
      return { a: await estadoDe(c, a), b: await estadoDe(c, b) };
    });
    registrar('CA-60_por_profesor_hora', { relleno: '20 de A en la última hora' }, salida);
    expect(salida).toEqual({ a: 'fallido/TOPE', b: 'pendiente' });
  });

  it('CA-60_el_tope_de_200_por_dia_es_por_profesor', async () => {
    const salida = await conRelojEnTransaccion(T0, async (c) => {
      await rellenar(c, SLUG_A, 200, '3 hours');
      const a = await encolar(c, 'recordatorio', 't03.diaA@example.test', 'a', 'c', null, SLUG_A);
      const b = await encolar(c, 'recordatorio', 't03.diaB@example.test', 'b', 'c', null, SLUG_B);
      return { a: await estadoDe(c, a), b: await estadoDe(c, b) };
    });
    registrar('CA-60_por_profesor_dia', { relleno: '200 de A hace 3 h' }, salida);
    expect(salida).toEqual({ a: 'fallido/TOPE', b: 'pendiente' });
  });

  it('CA-60_con_400_en_el_dia_en_toda_la_app_el_siguiente_de_cualquiera_nace_TOPE_GLOBAL_y_el_que_llego_a_su_tope_TOPE', async () => {
    const salida = await conRelojEnTransaccion(T0, async (c) => {
      await c.query("select privado.configurar_profesor('t03.c@example.test', 'Profesor C', 't03-c')");
      await rellenar(c, SLUG_A, 200, '3 hours');
      await rellenar(c, SLUG_B, 149, '3 hours');
      await rellenar(c, 't03-c', 50, '3 hours'); // 399 en toda la app
      const ultimo = await encolar(c, 'recordatorio', 't03.g400@example.test', 'c', 'c', null, 't03-c'); // el 400
      const a = await encolar(c, 'recordatorio', 't03.gA@example.test', 'a', 'c', null, SLUG_A);
      const b = await encolar(c, 'recordatorio', 't03.gB@example.test', 'b', 'c', null, SLUG_B);
      const cc = await encolar(c, 'recordatorio', 't03.gC@example.test', 'c', 'c', null, 't03-c');
      return { ultimo: await estadoDe(c, ultimo), a: await estadoDe(c, a), b: await estadoDe(c, b), c: await estadoDe(c, cc) };
    });
    registrar('CA-60_global', { relleno: 'A 200, B 149, C 50 = 399 hace 3 h' }, salida);
    expect(salida.ultimo).toBe('pendiente');
    expect(salida.a).toBe('fallido/TOPE');
    expect(salida.b).toBe('fallido/TOPE_GLOBAL');
    expect(salida.c).toBe('fallido/TOPE_GLOBAL');
  });

  it('CA-60_las_filas_TOPE_GLOBAL_no_cuentan_para_ningun_tope_y_el_profesor_las_ve_en_su_registro', async () => {
    const para = direccion('visibleB');
    const antes = await cuentaDelTope(SLUG_B);
    await insertarFila({ estado: 'fallido', motivo: 'TOPE_GLOBAL', destinatario: para, slug: SLUG_B }, true);
    const despues = await cuentaDelTope(SLUG_B);
    const r = await rest('profesorB', 'GET', `v_mails_fallidos?destinatario=eq.${encodeURIComponent(para)}&select=motivo`);
    const deA = await rest('profesor', 'GET', `v_mails_fallidos?destinatario=eq.${encodeURIComponent(para)}&select=motivo`);
    registrar('CA-60_registro', { destinatario: para }, { antes, despues, vistaB: r.cuerpo, vistaA: deA.cuerpo });
    expect(r.cuerpo).toEqual([{ motivo: 'TOPE_GLOBAL' }]);
    expect(deA.cuerpo, 'CA-52: A no ve el registro de B').toEqual([]);
    expect(despues).toEqual(antes);
  });
});
