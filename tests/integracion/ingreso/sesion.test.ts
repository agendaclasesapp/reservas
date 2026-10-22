// B04 · T04.4 · arranque de la sesión contra Auth local (H-020, CA-01 rama Google, ADR-007; caso T-ALU-01 y T-ALU-02).
// - H-020: una sesión guardada de un usuario borrado se cierra al abrir y la app sigue como visitante.
// - Un fallo de red conserva la sesión; un usuario que sigue existiendo no se cierra.
// - Vuelta de Google: la ruta guardada se restaura sin `?code=` en la URL (el canje lo simula un GoTrue que acepta el
//   código; Google real es evidencia manual, CA-01).
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { cerrar, sql } from '../../soporte/bd';
import { clienteAnon } from '../../soporte/usuarios';
import { esperarMail, mailUnico } from '../../soporte/correo';
import { iniciarSesion, validarSesionGuardada, type ValidadorDeSesion } from '../../../src/estado/sesion';
import { CLAVE_RUTA, guardarRuta, procesarRetorno } from '../../../src/estado/retorno';
import { almacenamientoEnMemoria, borrarPorMail } from './ayuda';

const creados: string[] = [];
afterEach(async () => {
  await borrarPorMail(creados.splice(0));
});
afterAll(cerrar);

describe('H-020 sesión guardada de un usuario borrado', () => {
  it('H-020_con_el_usuario_borrado_getUser_da_4xx_y_la_app_cierra_la_sesion_local_y_sigue_como_visitante', async () => {
    const mail = mailUnico('b04.h020b');
    creados.push(mail);
    const c = clienteAnon();
    await c.auth.signInWithOtp({ email: mail, options: { captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' } });
    const codigo = (await esperarMail(mail)).codigo!;
    const v = await c.auth.verifyOtp({ email: mail, token: codigo, type: 'email' });
    expect(v.error).toBeNull();
    const userId = v.data.user!.id;
    expect((await c.auth.getSession()).data.session).not.toBeNull();

    await sql('delete from auth.users where id = $1', [userId]);

    const cierres: unknown[] = [];
    const retorno = await iniciarSesion({
      href: 'http://127.0.0.1:4173/reservas/#/',
      history: { replaceState: () => undefined },
      storage: almacenamientoEnMemoria(),
      cargarAuth: async () => c.auth,
      haySesionGuardada: () => true,
      cargarValidador: async () => ({
        getUser: () => c.auth.getUser() as never,
        signOut: async (o) => (cierres.push(o), c.auth.signOut(o)),
      }),
    });
    expect(retorno).toMatchObject({ procesado: false, sesionCerrada: true });
    expect(cierres).toEqual([{ scope: 'local' }]);
    expect((await c.auth.getSession()).data.session, 'visitante: sin sesión guardada').toBeNull();
  });

  it('H-020_un_usuario_que_existe_conserva_la_sesion', async () => {
    const mail = mailUnico('b04.h020c');
    creados.push(mail);
    const c = clienteAnon();
    await c.auth.signInWithOtp({ email: mail, options: { captchaToken: 'XXXX.DUMMY.TOKEN.XXXX' } });
    await c.auth.verifyOtp({ email: mail, token: (await esperarMail(mail)).codigo!, type: 'email' });
    expect(await validarSesionGuardada(c.auth as unknown as ValidadorDeSesion)).toBe(true);
    expect((await c.auth.getSession()).data.session).not.toBeNull();
  });

  it('H-020_un_fallo_de_red_al_validar_conserva_la_sesion', async () => {
    const auth: ValidadorDeSesion = {
      getUser: async () => {
        throw new TypeError('fetch failed');
      },
      signOut: async () => {
        throw new Error('no debe cerrarse');
      },
    };
    expect(await validarSesionGuardada(auth)).toBe(true);
  });
});

describe('CA-01 rama Google: vuelta a la ruta guardada sin ?code=', () => {
  it('CA-01_el_canje_explicito_limpia_la_query_y_deja_la_ruta_guardada_en_el_hash', async () => {
    const storage = almacenamientoEnMemoria();
    guardarRuta(storage, '#/mis-clases');
    expect(storage.getItem(CLAVE_RUTA)).toBe('#/mis-clases');
    const urls: string[] = [];
    const r = await procesarRetorno({
      auth: { exchangeCodeForSession: async () => ({ error: null }) },
      href: 'http://127.0.0.1:4173/reservas/?code=abc123',
      history: { replaceState: (_a, _b, url) => void urls.push(String(url)) },
      storage,
    });
    expect(r).toMatchObject({ procesado: true, canjeado: true, ruta: '#/mis-clases' });
    expect(urls).toEqual(['/reservas/#/mis-clases']);
    expect(urls[0]).not.toContain('code=');
    expect(storage.getItem(CLAVE_RUTA)).toBeNull();
  });

  it('SEC-17_una_ruta_guardada_que_no_empieza_con_hash_barra_se_ignora', async () => {
    const storage = almacenamientoEnMemoria();
    guardarRuta(storage, 'https://malo.example/robo');
    expect(storage.getItem(CLAVE_RUTA)).toBe('#/');
    storage.setItem(CLAVE_RUTA, '//malo.example');
    const urls: string[] = [];
    const r = await procesarRetorno({
      auth: { exchangeCodeForSession: async () => ({ error: null }) },
      href: 'http://127.0.0.1:4173/reservas/?code=x',
      history: { replaceState: (_a, _b, url) => void urls.push(String(url)) },
      storage,
    });
    expect(r.ruta).toBe('#/');
    expect(urls).toEqual(['/reservas/#/']);
  });
});
