// API de la lógica del panel del profesor para las vistas (T09.2) y las pruebas (T09.3).
// PRF-01..05, PRF-07, PRF-08, AVI-01, AVI-04, SEC-09, SEC-17. Las vistas importan solo desde aquí.
//
// Uso típico en la vista:
//   const { lectura, recargar } = useAgendaProfesor(dia);          // agenda_profesor: huecos con nombres (PRF-05)
//   const { lectura: c } = useContadores();                         // contadores (AVI-01); totalPendientes(c.datos)
//   const a = accionesFila(fila, sesion.profesor.activo);           // crear / mover / cancelar / elegirAlcance
//   const r = await crearClase({ alumnoId, personaACargoId, inicio: fila.inicio, tipo, frecuencia, observacion });
//   const r = await moverClase(fila.clase_id, destino.inicio, 'solo_esta' | 'desde_aca');
//   const r = await cancelarClase(fila.clase_id, 'solo_esta' | 'desde_aca');
//   r.ok ? mensajeExito('crear', tipo) + r.salteadas : r.mensaje (r.campo marca el campo del 422)
//   permisosPanel(sesion.profesor.activo)                           // PRF-08: inactivo solo cancela
//
// B10 · T10.1 · Bloqueos (AGE-05, AGE-06, AGE-10, SEC-09):
//   const b = accionesBloqueo(fila);                                // { bloquear: libre y futuro, desbloquear: hay bloqueo_id }
//   const e = bloqueoDeHuecos(fila) | bloqueoDeHuecos(primera, ultima) | bloqueoDeHoras(dia, '09:00', '12:00', zona)
//             | bloqueoDeDias(primerDia, ultimoDia, zona);          // + motivo opcional (hasta 500)
//   const r = await bloquear(e, zona);                              // { ok: true, bloqueo_id } | FalloBloqueo
//   r.ok || r.conflictos.map((c) => textoConflicto(c, zona))        // 409 BLOQUEO_CON_RESERVAS (CA-14)
//   const r = await desbloquear(fila.bloqueo_id);                   // { ok: true } | FalloBloqueo (404: no es suyo)
//
// B16 · T16.1 · Varios días (ADR-023; CAL-07, CAL-08, CAL-09, SEC-17, SEC-35):
//   const filas = await leerAgendaDias(desde, hasta);               // de 1 a 7 días; agrupar por `dia` y `clase_id`
//   catch (e) { mensajeDeError(e) }                                  // ErrorAgendaDias: texto del catálogo, sin details
//
// B17 · T17.1 · Calendario (CAL-01..04, CAL-07..09, INV-02; ADR-023, ADR-024; DEC-42 A, DEC-44 A, DEC-50 A):
//   const limites = limitesPanel(zona);                              // hoy ± 366 en el huso del profesor
//   const v = vistaDesdeDireccion(searchParams, limites);           // { vista, dia, corregida } (CA-67)
//   if (v.corregida) setSearchParams(direccionCalendario(v), { replace: true });
//   const nav = navegacionCalendario(v, limites);                    // titulo, dias, desde/hasta, anterior/siguiente/hoy (null = deshabilitada, CA-68)
//   onSiguiente = () => setSearchParams(direccionCalendario(nav.siguiente!));
//   const { lectura, recargar } = useAgendaDias(nav.desde, nav.hasta);   // cargando (previo) | error (mensaje) | listo (datos)
//   const conf = useConfiguracionAgenda().lectura.datos;              // configuracion/logica: { config.duracion_min, grilla }
//   const dias = diasCalendario(nav.dias.map((d) => d.dia), datos.filas, zona);   // filas y BloqueClase por día
//   const eje = ejeCalendario(conf.grilla, conf.config.duracion_min, dias.flatMap((d) => d.clases));
//   style={{ '--cal-alto-hora': eje.altoHora }}; posicionEnEje(b.inicioMin, b.finMin, eje) × --cal-alto-hora
//
// B18 · T18.1 · Elementos y acciones del calendario (CAL-05, CAL-06, CAL-11, INV-01, INV-05; ADR-024 A-2, A-3, A-4):
//   const conf = configuracionCalendario(useConfiguracionAgenda().lectura);   // null en error o sin datos (A-3)
//   const { eje, columnas, grillaConocida } = calendarioConElementos(dias, conf, zona, sesion.profesor.activo);
//   columnas[i].zonasFueraDeTramo                                    // fondo sombreado, no tocable (CAL-05); [] con A-3
//   columnas[i].elementos: clase | hueco | bloqueo, en orden horario, con posicion (× --cal-alto-hora), carril y
//     carriles (ancho 1/carriles, A-4) y tocable (hueco libre futuro dentro de tramo, bloqueo propio, toda clase)
//   e.acciones (accionesFila) / e.accionesBloqueo: lo mismo que ofrece hoy la lista (INV-01, INV-05)
//   tras crear, mover, cancelar, bloquear o desbloquear con ok (y con un fallo de CODIGOS_DESACTUALIZADA):
//     useAgendaDias(nav.desde, nav.hasta).recargar() y useContadores().recargar()   // relee el rango y los contadores
//
// B19 · T19.1 · Solicitudes y enlace del día (CAL-12, CAL-20, INV-03, INV-04, SEC-16, SEC-36; ADR-025, DEC-42 A, DEC-43 A):
//   const s = solicitudDeBloque(e.clase) | solicitudDeFila(fila);  // PENDIENTE o «Cancelación pendiente»; origen de movimiento: null
//   const { confirmar, rechazar } = accionesRespuesta(sesion.profesor.activo);   // accionesSolicitud de la Lista (PRF-08)
//   validarMotivo(texto)                                            // esquemaMotivo / LARGO_MAX_MOTIVO de la Lista: error o null
//   const releer = () => { agenda.recargar(); contadores.recargar(); };
//   const r = await confirmarSolicitud(s, { releer }) | await rechazarSolicitud(s, motivo, { releer });
//   r.ok ? r.mensaje : r.mensaje (r.campo === 'motivo' marca el campo; r.desactualizada: ya se pidió releer)
//   const enlace = useEnlaceDia(dia);                               // …/#/p/<slug>?d=AAAA-MM-DD o null (deshabilitada)
//   const c = await copiarEnlaceDia(enlace);                        // 'ok' («Enlace copiado») | 'fallo'
import { cargarSupabase } from '../../../lib/supabase';
import type { Dia } from '../../../lib/fechas';
import * as agendaDias from './agendaDias';
import * as bloqueos from './bloqueos';
import * as panel from './panel';
import type {
  Alcance,
  Contadores,
  EntradaBloqueo,
  EntradaCrearClase,
  FilaAgendaDias,
  FilaAgendaProfesor,
} from './tipos';
import { useAgendaDiasConLector, type LecturaAgendaDias } from './useAgendaDias';
import {
  useAgendaProfesor as useAgendaConLector,
  useContadores as useContadoresConLector,
  type EstadoLecturaPanel,
} from './usePanel';

export {
  ALCANCES,
  CAMPOS_BLOQUEO,
  CAMPOS_PANEL,
  ESTADOS_CLASE_AGENDA,
  ESTADOS_HUECO_PROFESOR,
  esquemaBloqueoCreado,
  esquemaClaseCreada,
  esquemaClaseMovida,
  esquemaClasesCanceladas,
  esquemaConflictoBloqueo,
  esquemaContadores,
  esquemaFilaAgenda,
  esquemaFilaAgendaDias,
  FRECUENCIAS,
  LARGO_MAX_MOTIVO_BLOQUEO,
  LARGO_MAX_OBSERVACION,
  MAX_DIAS_AGENDA,
  MAX_DIAS_BLOQUEO,
  MENSAJES_BLOQUEO,
  MENSAJES_PANEL,
  TIPOS_CLASE,
  TIPOS_SOLICITUD,
} from './tipos';
export type {
  Alcance,
  BloqueoCreado,
  CampoBloqueo,
  CampoPanel,
  ClaseCreada,
  ClaseMovida,
  ClasesCanceladas,
  ConflictoBloqueo,
  Contadores,
  EntradaBloqueo,
  EntradaCrearClase,
  EstadoClaseAgenda,
  EstadoHuecoProfesor,
  FilaAgendaDias,
  FilaAgendaProfesor,
  Frecuencia,
  TipoClase,
  TipoSolicitud,
} from './tipos';
export { ErrorAgendaDias } from './agendaDias';
export {
  accionesFila,
  destinosLibres,
  falloPanel,
  mensajeExito,
  normalizarObservacion,
  permisosPanel,
  textoQuienToma,
  totalPendientes,
  validarCrearClase,
} from './panel';
export type {
  AccionesFila,
  DependenciasPanel,
  FalloPanel,
  OperacionPanel,
  ResultadoCancelar,
  ResultadoCrear,
  ResultadoMover,
} from './panel';
export {
  accionesBloqueo,
  bloqueoDeDias,
  bloqueoDeHoras,
  bloqueoDeHuecos,
  conflictosDelError,
  falloBloqueo,
  normalizarMotivo,
  textoConflicto,
  validarBloqueo,
} from './bloqueos';
export type {
  AccionesBloqueo,
  DependenciasBloqueo,
  FalloBloqueo,
  OperacionBloqueo,
  ResultadoBloquear,
  ResultadoDesbloquear,
} from './bloqueos';
export type { EstadoLecturaPanel, LectorAgendaProfesor, LectorContadores } from './usePanel';
export {
  DIAS_DE_ALCANCE_PANEL,
  PARAMETROS_CALENDARIO,
  VISTAS_CALENDARIO,
  diaSemanaIso,
  direccionCalendario,
  esVistaCalendario,
  fechaNumerica,
  limitesPanel,
  lunesDe,
  navegacionCalendario,
  vistaDesdeDireccion,
} from './vistaCalendario';
export type {
  DiaVisible,
  EstadoVistaCalendario,
  NavegacionCalendario,
  VistaCalendario,
  VistaDesdeDireccion,
} from './vistaCalendario';
export {
  ALTO_HORA_BASE_REM,
  ALTO_HORA_MAXIMO_REM,
  ALTO_MINIMO_HUECO_REM,
  DURACION_MINIMA_CALENDARIO_MIN,
  EJE_SIN_GRILLA,
  MINUTOS_DIA,
  altoHoraRem,
  bloquesDeClase,
  diasCalendario,
  ejeCalendario,
  minutosDeHora,
  minutosEnDia,
  posicionEnEje,
  sinClases,
  tramosDelDia,
  zonasFueraDeTramo,
} from './eje';
export type { BloqueClase, DiaCalendario, EjeCalendario, IntervaloMinutos, MarcaEje, PosicionEnEje } from './eje';
export {
  asignarCarriles,
  calendarioConElementos,
  configuracionCalendario,
  duracionDeHuecosLibres,
  intervaloVisual,
} from './elementosCalendario';
export type {
  CalendarioConElementos,
  ColumnaCalendario,
  ConfiguracionCalendario,
  ElementoBloqueo,
  ElementoCalendario,
  ElementoClase,
  ElementoHueco,
  LecturaConfiguracionCalendario,
  TipoElementoCalendario,
} from './elementosCalendario';
export { lecturaAgendaDias, useAgendaDiasConLector } from './useAgendaDias';
export type { AgendaDiasLeida, LecturaAgendaDias, LectorAgendaDias } from './useAgendaDias';
export {
  accionesRespuesta,
  CODIGOS_RESPUESTA_DESACTUALIZADA,
  confirmarSolicitud,
  esquemaMotivo,
  LARGO_MAX_MOTIVO,
  MENSAJES_RESPUESTA,
  puedeConfirmar,
  rechazarSolicitud,
  solicitudDeBloque,
  solicitudDeFila,
  validarMotivo,
} from './respuesta';
export type {
  Decision,
  FalloRespuesta,
  OpcionesRespuesta,
  ResultadoRespuestaCalendario,
  SolicitudEnCalendario,
} from './respuesta';
export {
  copiarEnlaceDia,
  enlaceDia,
  PARAMETRO_DIA_PUBLICO,
  slugValidoParaEnlace,
  useEnlaceDia,
} from './enlaceDia';
export type { CopiarTexto, ResultadoCopiaEnlace } from './enlaceDia';

/** Dependencias reales: supabase-js cargado con import() (ADR-017). */
export function dependenciasPanel(): panel.DependenciasPanel {
  return { obtenerCliente: () => cargarSupabase() };
}

/** `crear_clase` (PRF-01, PRF-04, AVI-04). */
export function crearClase(
  entrada: EntradaCrearClase,
  deps: panel.DependenciasPanel = dependenciasPanel(),
): Promise<panel.ResultadoCrear> {
  return panel.crearClase(entrada, deps);
}

/** `mover_clase` (PRF-02, PRF-08, AVI-04). */
export function moverClase(
  claseId: string,
  destino: string,
  alcance: Alcance,
  deps: panel.DependenciasPanel = dependenciasPanel(),
): Promise<panel.ResultadoMover> {
  return panel.moverClase(claseId, destino, alcance, deps);
}

/** `cancelar_clase` (PRF-03, PRF-08, AVI-04). */
export function cancelarClase(
  claseId: string,
  alcance: Alcance,
  deps: panel.DependenciasPanel = dependenciasPanel(),
): Promise<panel.ResultadoCancelar> {
  return panel.cancelarClase(claseId, alcance, deps);
}

/** `bloquear` (AGE-05, CA-14): `zona` es el huso del profesor (`useHusoDelProfesor`), para validar el rango. */
export function bloquear(
  entrada: EntradaBloqueo,
  zona: string,
  deps: bloqueos.DependenciasBloqueo = dependenciasPanel(),
): Promise<bloqueos.ResultadoBloquear> {
  return bloqueos.bloquear(entrada, zona, deps);
}

/** `desbloquear` (AGE-06, CA-52). */
export function desbloquear(
  bloqueoId: string,
  deps: bloqueos.DependenciasBloqueo = dependenciasPanel(),
): Promise<bloqueos.ResultadoDesbloquear> {
  return bloqueos.desbloquear(bloqueoId, deps);
}

/** `agenda_profesor(p_dia)` (PRF-05). Lanza el error de postgrest-js. */
export function leerAgendaProfesor(
  dia: Dia,
  deps: panel.DependenciasPanel = dependenciasPanel(),
): Promise<FilaAgendaProfesor[]> {
  return panel.leerAgendaProfesor(dia, deps);
}

/**
 * `agenda_profesor_dias(p_desde, p_hasta)` (ADR-023): de 1 a 7 días seguidos. Lanza `ErrorAgendaDias` con el texto
 * del catálogo (SEC-17, SEC-35).
 */
export function leerAgendaDias(
  desde: Dia,
  hasta: Dia,
  deps: panel.DependenciasPanel = dependenciasPanel(),
): Promise<FilaAgendaDias[]> {
  return agendaDias.leerAgendaDias(desde, hasta, deps);
}

/** `contadores()` (AVI-01). Lanza el error de postgrest-js. */
export function leerContadores(deps: panel.DependenciasPanel = dependenciasPanel()): Promise<Contadores> {
  return panel.leerContadores(deps);
}

const LECTOR_AGENDA_REAL = (dia: Dia) => panel.leerAgendaProfesor(dia, dependenciasPanel());
const LECTOR_CONTADORES_REAL = () => panel.leerContadores(dependenciasPanel());

/** Agenda del día del profesor; vuelve a leer al cambiar el día; `recargar()` después de cada operación. */
export function useAgendaProfesor(dia: Dia): {
  lectura: EstadoLecturaPanel<FilaAgendaProfesor[]>;
  recargar: () => void;
} {
  return useAgendaConLector(LECTOR_AGENDA_REAL, dia);
}

const LECTOR_AGENDA_DIAS_REAL = (desde: Dia, hasta: Dia) => agendaDias.leerAgendaDias(desde, hasta, dependenciasPanel());

/**
 * B17 (ADR-023): agenda del rango visible del calendario (en Día, `desde = hasta`); vuelve a leer al cambiar el
 * rango; `recargar()` después de cada operación y en «Reintentar». Solo el rango viaja: el profesor es el de la
 * sesión (INV-02). El error es el texto del catálogo (SEC-17, SEC-35).
 */
export function useAgendaDias(desde: Dia, hasta: Dia): { lectura: LecturaAgendaDias; recargar: () => void } {
  return useAgendaDiasConLector(LECTOR_AGENDA_DIAS_REAL, desde, hasta);
}

/** Contadores de pendientes del profesor (AVI-01). */
export function useContadores(): { lectura: EstadoLecturaPanel<Contadores>; recargar: () => void } {
  return useContadoresConLector(LECTOR_CONTADORES_REAL);
}
