// B15 · T15.3 · alta de profesores por el Administrador por la API real (PostgREST + Auth + Mailpit).
// Casos: CA-49 (T-ADM-02, T-ADM-03, T-ADM-04, T-ADM-06, T-ADM-07 rama API), CA-61 rama de B15 (T-ADM-05), SEC-09, DEC-31, DEC-34.
// Datos sintéticos: mails t15.*@example.test y slugs t15-*; se borran al terminar. Entrada y salida de cada caso en
// test-results/evidencia-admin.jsonl.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { ingresarPorCodigo, rest, rpc, sesionDe, SLUG_A, type Rol } from '../../soporte/usuarios';
import { esperarMailPara, mailsPara, REMITENTE_LOCAL } from '../mails/ayuda';
import { alta, borrarProfesor, cuerpoDe, limpiarT15, mailT15, registrar, restConToken, rpcConToken, slugT15 } from './ayuda';

const ROLES_USADOS: Rol[] = ['administrador', 'profesor', 'alumno', 'ficha_incompleta'];

beforeAll(async () => {
  for (const r of ROLES_USADOS) await sesionDe(r);
  await limpiarT15();
}, 300_000);
afterEach(limpiarT15);
afterAll(async () => {
  await limpiarT15();
  await cerrar();
});

const cuantosProfesores = async () => Number((await sql<{ n: string }>('select count(*)::text n from public.profesor'))[0].n);
const detalle = (r: { cuerpo: unknown }) => JSON.parse(cuerpoDe(r).details as string) as { campo: string };

describe('CA-49 alta de un profesor nuevo y su primer ingreso', () => {
  it('CA-49_T-ADM-03_el_alta_crea_al_profesor_activo_y_le_llega_el_mail_con_su_enlace_y_el_aviso_de_DEC-34', async () => {
    const mail = mailT15('carla');
    const slug = slugT15();
    const r = await alta(mail, 'Carla', slug);
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(cuerpoDe(r)).toMatchObject({ slug, adoptado: false });
    const [fila] = await sql<{ id: string; activo: boolean; nombre: string; slug_provisional: boolean }>(
      'select id, activo, nombre, slug_provisional from public.profesor where mail = $1',
      [mail],
    );
    expect(fila).toMatchObject({ activo: true, nombre: 'Carla', slug_provisional: false });
    expect(cuerpoDe(r).profesor_id).toBe(fila.id);

    const m = await esperarMailPara(mail);
    registrar('CA-49_T-ADM-03', { mail, nombre: 'Carla', slug }, { status: r.status, cuerpo: r.cuerpo, from: m.From, replyTo: m.ReplyTo, asunto: m.Subject });
    expect(m.From.Address).toBe(REMITENTE_LOCAL);
    expect(m.From.Name).toBe('Agenda Clases App');
    expect(m.ReplyTo ?? []).toHaveLength(0);
    expect(m.Subject).toBe('Tu agenda en Agenda Clases App');
    expect(m.Text).toContain(`#/p/${slug}`);
    // DEC-34: nombre público y mail visible para sus alumnos.
    expect(m.Text).toContain('Tu nombre es público');
    expect(m.Text).toMatch(/tu mail como dirección de respuesta/);
    expect(m.Text).toContain('Carla');
  });

  it('CA-49_T-ADM-06_la_persona_entra_con_ese_mail_y_ve_su_panel_de_profesor_sin_aprobacion_ni_ficha_con_la_grilla_inicial', async () => {
    const mail = mailT15('ingreso');
    const slug = slugT15();
    expect((await alta(mail, 'Ingreso Nuevo', slug)).status).toBe(200);
    await esperarMailPara(mail); // el mail de alta llega antes de pedir el código: así el código es el segundo mail
    const { accessToken, userId } = await ingresarPorCodigo(mail);
    const ses = await rpcConToken(accessToken, 'sesion_actual');
    registrar('CA-49_T-ADM-06', { mail, slug }, { status: ses.status, sesion: ses.cuerpo });
    expect(ses.status, JSON.stringify(ses.cuerpo)).toBe(200);
    expect(cuerpoDe(ses)).toMatchObject({ rol: 'profesor', es_administrador: false, profesor: { slug, activo: true } });
    // Nadie le pide aprobación ni ficha: no hay ficha de alumno de ese usuario y el profesor quedó vinculado al usuario.
    expect((await sql<{ n: string }>('select count(*)::text n from public.alumno where user_id = $1', [userId]))[0].n).toBe('0');
    expect((await sql<{ user_id: string }>('select user_id from public.profesor where mail = $1', [mail]))[0].user_id).toBe(userId);
    // Su agenda parte con la grilla de AGE-01: lunes a viernes, dos tramos por día.
    const grilla = await restConToken(accessToken, 'grilla_tramo?select=dia_semana,desde,hasta');
    expect(grilla.status).toBe(200);
    expect(grilla.cuerpo as unknown[]).toHaveLength(10);
    expect(new Set((grilla.cuerpo as { dia_semana: number }[]).map((t) => t.dia_semana)).size).toBe(5);
    // Ve su lista de alumnos (vacía) y no la de otro profesor.
    const alumnos = await restConToken(accessToken, 'v_alumnos?select=id');
    expect(alumnos.status).toBe(200);
    expect(alumnos.cuerpo).toEqual([]);
  });

  it('CA-49_T-ADM-04_cada_enlace_invalido_o_reservado_da_422_p_slug_y_el_repetido_409_SLUG_YA_USADO_sin_crear_nada', async () => {
    const antes = await cuantosProfesores();
    const malos = ['ab', 'Carla_1', 'x'.repeat(31), 'admin', 'mis-clases', 'configuracion', '-abc', 'abc-', 'con espacio'];
    for (const slug of malos) {
      const r = await alta(mailT15('slug'), 'Nombre', slug);
      registrar('CA-49_T-ADM-04', { slug }, { status: r.status, cuerpo: r.cuerpo });
      expect(r.status, `${slug}: ${JSON.stringify(r.cuerpo)}`).toBe(422);
      expect(cuerpoDe(r).message).toBe('DATOS_INVALIDOS');
      expect(detalle(r), slug).toEqual({ campo: 'p_slug' });
    }
    const rep = await alta(mailT15('rep'), 'Repetido', SLUG_A);
    expect(rep.status).toBe(409);
    expect(cuerpoDe(rep).message).toBe('SLUG_YA_USADO');
    expect(await cuantosProfesores(), 'ningún rechazo creó un profesor').toBe(antes);
    // Los extremos válidos: 3 y 30 caracteres.
    const tres = await alta(mailT15('tres'), 'Tres', `t${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`);
    expect(tres.status, JSON.stringify(tres.cuerpo)).toBe(200);
    const treinta = await alta(mailT15('treinta'), 'Treinta', slugT15(30));
    expect(treinta.status, JSON.stringify(treinta.cuerpo)).toBe(200);
    expect(await cuantosProfesores()).toBe(antes + 2);
    // El enlace del repetido en mayúsculas no es «repetido» sino inválido (el contrato exige minúsculas).
    const may = await alta(mailT15('may'), 'May', SLUG_A.toUpperCase());
    expect(may.status).toBe(422);
  });

  it('CA-49_SEC-09_un_mail_o_un_nombre_invalidos_dan_422_con_el_campo', async () => {
    const r1 = await alta('sin-arroba', 'Nombre', slugT15());
    const r2 = await alta(mailT15('nombre'), '   ', slugT15());
    const r3 = await rpcConToken((await sesionDe('administrador')).accessToken, 'alta_profesor', { p_mail: null, p_nombre: 'X', p_slug: slugT15() });
    registrar('CA-49_SEC-09', { casos: ['mail sin arroba', 'nombre en blanco', 'mail nulo'] }, [r1, r2, r3].map((r) => ({ status: r.status, cuerpo: r.cuerpo })));
    for (const r of [r1, r2, r3]) {
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(422);
      expect(cuerpoDe(r).message).toBe('DATOS_INVALIDOS');
    }
    expect([detalle(r1).campo, detalle(r2).campo, detalle(r3).campo]).toEqual(['p_mail', 'p_nombre', 'p_mail']);
  });
});

describe('CA-61 rama de B15 / CA-49 el alta con el mail de alguien que ya existe', () => {
  it('CA-61_T-ADM-05_el_mail_de_un_profesor_da_409_MAIL_YA_REGISTRADO_sin_datos_y_sin_crear_profesor_ni_cuenta', async () => {
    const antes = await cuantosProfesores();
    const [{ n: usuarios }] = await sql<{ n: string }>('select count(*)::text n from auth.users');
    const r = await alta('PROFESOR@example.test', 'Impostor', slugT15());
    registrar('CA-61_T-ADM-05_profesor', { mail: 'PROFESOR@example.test' }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status).toBe(409);
    expect(cuerpoDe(r).message).toBe('MAIL_YA_REGISTRADO');
    expect(cuerpoDe(r).details ?? null).toBeNull();
    expect(JSON.stringify(r.cuerpo)).not.toMatch(/Profesor de Prueba/);
    expect(await cuantosProfesores()).toBe(antes);
    expect((await sql<{ n: string }>('select count(*)::text n from auth.users'))[0].n).toBe(usuarios);
  });

  it('CA-61_T-ADM-05_el_mail_de_una_persona_con_ficha_completa_da_409_sin_datos_y_su_ficha_y_cuenta_no_cambian', async () => {
    const persona = await sesionDe('alumno');
    const consulta = 'select id, nombre, telefono, fecha_nacimiento::text, estado, user_id from public.alumno where id = $1';
    const antes = await sql(consulta, [persona.alumnoId]);
    const insc = await sql('select profesor_id, estado from public.inscripcion where alumno_id = $1 order by profesor_id', [persona.alumnoId]);
    const total = await cuantosProfesores();
    const r = await alta(persona.mail!, 'Otro nombre', slugT15());
    registrar('CA-61_T-ADM-05_ficha_completa', { mail: persona.mail }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(409);
    expect(cuerpoDe(r).message).toBe('MAIL_YA_REGISTRADO');
    expect(cuerpoDe(r).details ?? null).toBeNull();
    expect(JSON.stringify(r.cuerpo)).not.toContain('Alumno alumno');
    expect(await cuantosProfesores()).toBe(total);
    expect(await sql(consulta, [persona.alumnoId])).toEqual(antes);
    expect(await sql('select profesor_id, estado from public.inscripcion where alumno_id = $1 order by profesor_id', [persona.alumnoId])).toEqual(insc);
    // La persona sigue entrando como alumno (DEC-31: profesor y alumno son excluyentes).
    expect(cuerpoDe(await rpc('alumno', 'sesion_actual'))).toMatchObject({ rol: 'alumno', profesor: null });
  });

  it('CA-61_la_ficha_incompleta_se_reemplaza_y_el_usuario_queda_vinculado_como_profesor', async () => {
    const f = await sesionDe('ficha_incompleta');
    const slug = slugT15();
    try {
      expect((await sql<{ n: string }>('select count(*)::text n from public.alumno where user_id = $1', [f.userId]))[0].n).toBe('1');
      const r = await alta(f.mail!, 'Ficha Vacía', slug);
      registrar('CA-61_ficha_incompleta', { mail: f.mail, slug }, { status: r.status, cuerpo: r.cuerpo });
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
      expect(cuerpoDe(r)).toMatchObject({ slug, adoptado: false });
      // La ficha incompleta se reemplazó y el usuario que ya existía quedó vinculado, sin crear otra cuenta.
      expect((await sql<{ n: string }>('select count(*)::text n from public.alumno where user_id = $1 or lower(mail::text) = lower($2)', [f.userId, f.mail]))[0].n).toBe('0');
      expect((await sql<{ user_id: string }>('select user_id from public.profesor where slug = $1', [slug]))[0].user_id).toBe(f.userId);
      expect((await sql<{ n: string }>('select count(*)::text n from auth.users where lower(email) = lower($1)', [f.mail]))[0].n).toBe('1');
      // Con su sesión de siempre, ahora es profesor.
      const ses = await rpcConToken(f.accessToken, 'sesion_actual');
      expect(cuerpoDe(ses)).toMatchObject({ rol: 'profesor', profesor: { slug } });
      // Y ya no puede completar una ficha de alumno (DEC-31).
      const ficha = await rpcConToken(f.accessToken, 'completar_ficha', { p_nombre: 'X', p_telefono: '099 111 222', p_fecha_nacimiento: '2000-01-01', p_slug: SLUG_A, p_como_llego: 'x' });
      expect(ficha.status).toBe(403);
    } finally {
      // Deja a la persona como la entrega tests/soporte/usuarios.ts: ficha vacía con el mismo id.
      await borrarProfesor(slug);
      await sql('delete from public.mail_salida where destinatario = $1', [f.mail]);
      await sql('insert into public.alumno (id, user_id, mail) values ($1, $2, $3) on conflict (id) do nothing', [f.alumnoId, f.userId, f.mail]);
    }
  });

  it('CA-49_DEC-31_el_mail_del_Administrador_se_acepta_y_entra_como_profesor_con_es_administrador', async () => {
    const adm = await sesionDe('administrador');
    const slug = slugT15();
    try {
      const r = await alta(adm.mail!, 'Admin Profesor', slug);
      registrar('CA-49_DEC-31', { mail: adm.mail, slug }, { status: r.status, cuerpo: r.cuerpo });
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
      const ses = cuerpoDe(await rpcConToken(adm.accessToken, 'sesion_actual'));
      expect(ses).toMatchObject({ rol: 'profesor', es_administrador: true, profesor: { slug } });
      // Sigue pudiendo administrar.
      expect((await rpcConToken(adm.accessToken, 'listar_profesores')).status).toBe(200);
    } finally {
      await borrarProfesor(slug);
      await sql('delete from public.mail_salida where destinatario = $1', [adm.mail]);
    }
  });
});

describe('CA-61 / spec §8 adopción del profesor con enlace provisional', () => {
  it('ADM-02_el_alta_con_el_mail_del_profesor_provisional_lo_adopta_y_conserva_su_agenda_y_le_llega_su_enlace_definitivo', async () => {
    const mail = mailT15('adopta');
    const provisional = slugT15();
    const definitivo = slugT15();
    const [{ id }] = await sql<{ id: string }>('select privado.configurar_profesor($1, $2, $3) as id', [mail, 'Provisional', provisional]);
    await sql('update public.profesor set slug_provisional = true, duracion_min = 45 where id = $1', [id]);
    const [{ n: tramos }] = await sql<{ n: string }>('select count(*)::text n from public.grilla_tramo where profesor_id = $1', [id]);
    await sql('insert into public.grilla_tramo (profesor_id, dia_semana, desde, hasta) values ($1, 6, $2, $3)', [id, '09:00', '10:00']);
    const antes = await cuantosProfesores();

    const r = await alta(mail.toUpperCase(), 'Definitivo', definitivo);
    registrar('CA-61_adopcion', { mail, provisional, definitivo }, { status: r.status, cuerpo: r.cuerpo });
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200);
    expect(cuerpoDe(r)).toEqual({ profesor_id: id, slug: definitivo, adoptado: true });
    expect(await cuantosProfesores()).toBe(antes);
    const [p] = await sql<{ nombre: string; slug: string; slug_provisional: boolean; activo: boolean; duracion_min: number }>(
      'select nombre, slug, slug_provisional, activo, duracion_min from public.profesor where id = $1',
      [id],
    );
    expect(p).toEqual({ nombre: 'Definitivo', slug: definitivo, slug_provisional: false, activo: true, duracion_min: 45 });
    expect((await sql<{ n: string }>('select count(*)::text n from public.grilla_tramo where profesor_id = $1', [id]))[0].n, 'conserva su grilla').toBe(String(Number(tramos) + 1));

    // El profesor adoptado recibe su enlace definitivo y el aviso, sin el texto de la grilla inicial.
    const m = await esperarMailPara(mail);
    expect(m.Text).toContain(`#/p/${definitivo}`);
    expect(m.Text).toContain('Tu nombre es público');
    expect(m.Text).not.toContain('arranca de lunes');
    // La segunda alta con ese mail ya es 409.
    const otra = await alta(mail, 'Otra vez', slugT15());
    expect(otra.status).toBe(409);
    expect(cuerpoDe(otra).message).toBe('MAIL_YA_REGISTRADO');
    expect((await mailsPara(mail)).length, 'un solo mail de alta').toBe(1);
  });

  it('ADM-02_adoptar_con_el_enlace_de_otro_profesor_da_409_SLUG_YA_USADO_y_no_cambia_nada', async () => {
    const mail = mailT15('adopta2');
    const provisional = slugT15();
    const [{ id }] = await sql<{ id: string }>('select privado.configurar_profesor($1, $2, $3) as id', [mail, 'Provisional', provisional]);
    await sql('update public.profesor set slug_provisional = true where id = $1', [id]);
    const r = await alta(mail, 'Nuevo nombre', SLUG_A);
    expect(r.status).toBe(409);
    expect(cuerpoDe(r).message).toBe('SLUG_YA_USADO');
    expect((await sql('select nombre, slug, slug_provisional from public.profesor where id = $1', [id]))[0]).toEqual({ nombre: 'Provisional', slug: provisional, slug_provisional: true });
  });
});

describe('CA-49 / CA-50 el alta solo la hace el Administrador y nadie se registra como profesor', () => {
  it('CA-49_alumno_y_profesor_reciben_403_PROHIBIDO_y_no_se_crea_nada', async () => {
    const antes = await cuantosProfesores();
    const mail = mailT15('ajeno');
    const slug = slugT15();
    for (const rol of ['alumno', 'profesor', 'ficha_incompleta'] as Rol[]) {
      const r = await rpc(rol, 'alta_profesor', { p_mail: mail, p_nombre: 'Ajeno', p_slug: slug });
      registrar('CA-49_403', { rol, mail, slug }, { status: r.status, cuerpo: r.cuerpo });
      expect(r.status, rol).toBe(403);
      expect(cuerpoDe(r).message).toBe('PROHIBIDO');
    }
    expect(await cuantosProfesores()).toBe(antes);
    // Por la tabla tampoco: un INSERT directo del profesor o de la persona en `profesor` se rechaza.
    for (const rol of ['alumno', 'profesor'] as Rol[]) {
      const ins = await rest(rol, 'POST', 'profesor', { mail, slug, nombre: 'Directo' });
      expect([401, 403], `${rol}: ${JSON.stringify(ins.cuerpo)}`).toContain(ins.status);
    }
    expect(await cuantosProfesores()).toBe(antes);
  });

  it('CA-50_ADM-03_el_Administrador_ve_la_lista_de_profesores_con_su_estado_y_ninguna_tabla_de_alumnos', async () => {
    const mail = mailT15('lista');
    const slug = slugT15();
    expect((await alta(mail, 'Zeta Lista', slug)).status).toBe(200);
    const l = await rpcConToken((await sesionDe('administrador')).accessToken, 'listar_profesores');
    expect(l.status, JSON.stringify(l.cuerpo)).toBe(200);
    const filas = l.cuerpo as Record<string, unknown>[];
    registrar('CA-50_ADM-03', { rol: 'administrador' }, { status: l.status, profesores: filas.map((f) => ({ slug: f.slug, activo: f.activo })) });
    for (const f of filas) expect(Object.keys(f).sort()).toEqual(['activo', 'creado_en', 'mail', 'nombre', 'profesor_id', 'slug']);
    expect(filas.find((f) => f.slug === slug)).toMatchObject({ nombre: 'Zeta Lista', mail, activo: true });
    expect(filas.map((f) => f.slug)).toEqual(expect.arrayContaining([SLUG_A, 'profesora-b', slug]));
    // Sin fichas, clases ni solicitudes de alumnos con la sesión del Administrador que no es profesor.
    for (const tabla of ['alumno', 'inscripcion', 'reserva', 'clase', 'v_alumnos', 'mail_salida']) {
      const t = await rest('administrador', 'GET', `${tabla}?select=*`);
      if (t.status === 200) expect(t.cuerpo, tabla).toEqual([]);
      else expect([401, 403], `${tabla}: ${t.status}`).toContain(t.status);
    }
  });
});
