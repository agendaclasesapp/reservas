// Guardas por rol y por vínculo con cada profesor (ADR-020, WEB-09, WEB-10, ALU-03, PRF-08).
import { describe, expect, it } from 'vitest';
import {
  accesoDe,
  decidirGuarda,
  destinoInicio,
  destinoSinPermisos,
  MOTIVOS_SIN_PERMISOS,
  motivoSinPermisos,
  rutaDeVuelta,
  usuarioNavegacion,
  type EstadoSesion,
} from '../../../src/estado';
import { ADMINISTRADOR, enSesion, inscripcion, persona, profesor } from './soporte';

const ir = (pathname: string, search = '') => ({ pathname, search });
const PANEL = { texto: 'Ir al panel', href: '#/panel' };
const ADMIN = { texto: 'Ir a administración', href: '#/admin' };
const INICIO = { texto: 'Ir a la agenda', href: '#/' };

describe('WEB-09: a dónde lleva #/', () => {
  it('WEB_09_profesor_al_panel_y_administrador_a_admin', () => {
    expect(destinoInicio(profesor())).toBe('/panel');
    // El Administrador que también es profesor entra como profesor (ADR-020).
    expect(destinoInicio(profesor('ana-perez', true, true))).toBe('/panel');
    expect(destinoInicio(ADMINISTRADOR)).toBe('/admin');
    expect(decidirGuarda(ir('/'), enSesion(ADMINISTRADOR))).toEqual({ tipo: 'redirigir', a: '/admin' });
    expect(decidirGuarda(ir('/'), enSesion(profesor()))).toEqual({ tipo: 'redirigir', a: '/panel' });
  });

  it('WEB_09_persona_con_un_vinculo_va_a_su_agenda_con_cualquier_estado', () => {
    for (const estado of ['pendiente', 'aprobado', 'rechazado', 'sin_cuenta'] as const) {
      expect(destinoInicio(persona([inscripcion('ana-perez', estado)]))).toBe('/p/ana-perez');
    }
    expect(decidirGuarda(ir('/'), enSesion(persona([inscripcion('ana-perez', 'aprobado')])))).toEqual({
      tipo: 'redirigir',
      a: '/p/ana-perez',
    });
  });

  it('WEB_09_sin_vinculo_o_con_varios_se_queda_en_el_inicio', () => {
    const varios = persona([inscripcion('ana-perez', 'aprobado'), inscripcion('beto-gil', 'pendiente')]);
    expect(destinoInicio(persona([]))).toBeNull();
    expect(destinoInicio(varios)).toBeNull();
    expect(destinoInicio(persona([inscripcion('ana-perez', 'aprobado')], 'borrado'))).toBeNull();
    expect(decidirGuarda(ir('/'), enSesion(varios))).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/'), enSesion(persona([])))).toEqual({ tipo: 'mostrar' });
  });
});

describe('WEB-10: #/admin solo para el Administrador', () => {
  it('WEB_10_el_administrador_entra_a_admin_y_no_a_rutas_del_profesor', () => {
    const admin = enSesion(ADMINISTRADOR);
    expect(accesoDe('/admin')).toBe('administrador');
    expect(decidirGuarda(ir('/admin'), admin)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/panel'), admin)).toEqual({
      tipo: 'sin_permisos',
      motivo: MOTIVOS_SIN_PERMISOS.soloProfesor,
      destino: ADMIN,
    });
    expect(decidirGuarda(ir('/ficha'), admin)).toEqual({
      tipo: 'sin_permisos',
      motivo: MOTIVOS_SIN_PERMISOS.soloAlumnos,
      destino: ADMIN,
    });
  });

  it('WEB_10_el_profesor_administrador_entra_a_admin_y_el_resto_no', () => {
    expect(decidirGuarda(ir('/admin'), enSesion(profesor('ana-perez', true, true)))).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/admin'), enSesion(profesor()))).toEqual({
      tipo: 'sin_permisos',
      motivo: MOTIVOS_SIN_PERMISOS.soloAdministrador,
      destino: PANEL,
    });
    expect(decidirGuarda(ir('/admin'), enSesion(persona([inscripcion('ana-perez', 'aprobado')])))).toEqual({
      tipo: 'sin_permisos',
      motivo: MOTIVOS_SIN_PERMISOS.soloAdministrador,
      destino: INICIO,
    });
    expect(decidirGuarda(ir('/admin'), { tipo: 'visitante' })).toEqual({
      tipo: 'redirigir',
      a: '/ingreso?volver=%2Fadmin',
    });
  });
});

describe('PRF-08 y vínculos por profesor (ALU-03, DEC-28)', () => {
  it('PRF_08_el_profesor_inactivo_sigue_entrando_a_sus_pantallas', () => {
    const inactivo = enSesion(profesor('ana-perez', false));
    for (const ruta of ['/panel', '/lista', '/configuracion']) {
      expect(decidirGuarda(ir(ruta), inactivo)).toEqual({ tipo: 'mostrar' });
    }
  });

  it('ALU_03_con_un_vinculo_aprobado_entre_varios_pide_clases', () => {
    const s = enSesion(persona([inscripcion('ana-perez', 'rechazado'), inscripcion('beto-gil', 'aprobado')]));
    expect(decidirGuarda(ir('/solicitud'), s)).toEqual({ tipo: 'mostrar' });
    expect(decidirGuarda(ir('/mis-clases'), s)).toEqual({ tipo: 'mostrar' });
  });

  it('ALU_03_motivo_de_sin_permisos_segun_los_vinculos', () => {
    const conVinculos = (...estados: ('pendiente' | 'rechazado' | 'sin_cuenta')[]) =>
      persona(estados.map((e, i) => inscripcion(`prof-${i}`, e)));
    expect(motivoSinPermisos('/solicitud', persona([]))).toBe(MOTIVOS_SIN_PERMISOS.sinVinculo);
    expect(motivoSinPermisos('/solicitud', conVinculos('rechazado', 'pendiente'))).toBe(MOTIVOS_SIN_PERMISOS.pendiente);
    expect(motivoSinPermisos('/solicitud', conVinculos('rechazado', 'rechazado'))).toBe(MOTIVOS_SIN_PERMISOS.rechazado);
    expect(motivoSinPermisos('/solicitud', conVinculos('sin_cuenta'))).toBe(MOTIVOS_SIN_PERMISOS.sinAcceso);
    expect(motivoSinPermisos('/ficha', persona([], 'borrado'))).toBe(MOTIVOS_SIN_PERMISOS.sinAcceso);
    expect(motivoSinPermisos('/lista', null)).toBe(MOTIVOS_SIN_PERMISOS.soloProfesor);
    expect(motivoSinPermisos('/mis-clases', null)).toBe(MOTIVOS_SIN_PERMISOS.soloAlumnos);
    expect(motivoSinPermisos('/mis-clases', profesor())).toBe(MOTIVOS_SIN_PERMISOS.soloAlumnos);
  });

  it('ALU_03_el_motivo_de_rechazo_del_profesor_no_va_en_sin_permisos', () => {
    const s = persona([inscripcion('ana-perez', 'rechazado', { motivo_rechazo: 'Sin cupo' })]);
    expect(motivoSinPermisos('/solicitud', s)).not.toContain('Sin cupo');
  });

  it('WEB_03_salida_de_sin_permisos_por_rol', () => {
    expect(destinoSinPermisos(profesor())).toEqual(PANEL);
    expect(destinoSinPermisos(ADMINISTRADOR)).toEqual(ADMIN);
    expect(destinoSinPermisos(persona([]))).toEqual(INICIO);
    expect(destinoSinPermisos(null)).toEqual(INICIO);
  });
});

describe('ruta de vuelta y navegación', () => {
  it('WEB_02_la_vuelta_acepta_la_agenda_de_un_profesor_y_rechaza_lo_ajeno', () => {
    expect(rutaDeVuelta('?volver=%2Fp%2Fana-perez')).toBe('/p/ana-perez');
    expect(rutaDeVuelta('?volver=%2Fadmin')).toBe('/admin');
    expect(rutaDeVuelta('?volver=%2Fp%2F')).toBe('/');
    expect(rutaDeVuelta('?volver=%2Fp%2Fa%2Fb')).toBe('/');
    expect(rutaDeVuelta('?volver=%2Fingreso')).toBe('/');
    expect(rutaDeVuelta('?volver=%2F%2Fevil.example')).toBe('/');
    expect(rutaDeVuelta('')).toBe('/');
  });

  it('WEB_03_navegacion_del_administrador_y_de_la_persona_por_vinculos', () => {
    const sesion = (s: Parameters<typeof enSesion>[0]): EstadoSesion => enSesion(s);
    expect(usuarioNavegacion(sesion(ADMINISTRADOR))).toEqual({ rol: 'administrador' });
    expect(usuarioNavegacion(sesion(persona([], 'borrado')))).toEqual({ rol: 'alumno', estado: 'borrado' });
    expect(usuarioNavegacion(sesion(persona([])))).toEqual({ rol: 'alumno', estado: 'pendiente' });
    expect(
      usuarioNavegacion(sesion(persona([inscripcion('a-1x', 'rechazado'), inscripcion('b-1x', 'aprobado')]))),
    ).toEqual({ rol: 'alumno', estado: 'aprobado' });
    expect(
      usuarioNavegacion(sesion(persona([inscripcion('a-1x', 'rechazado'), inscripcion('b-1x', 'pendiente')]))),
    ).toEqual({ rol: 'alumno', estado: 'pendiente' });
    expect(usuarioNavegacion({ tipo: 'cargando' })).toBeUndefined();
  });

  it('ADM_04_el_profesor_que_ademas_es_administrador_lleva_la_marca_al_menu', () => {
    expect(usuarioNavegacion(enSesion(profesor('ana-perez', true, true)))).toEqual({
      rol: 'profesor',
      esAdministrador: true,
    });
    expect(usuarioNavegacion(enSesion(profesor()))).toStrictEqual({ rol: 'profesor' });
  });
});
