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
import { cargarSupabase } from '../../../lib/supabase';
import type { Dia } from '../../../lib/fechas';
import * as bloqueos from './bloqueos';
import * as panel from './panel';
import type { Alcance, Contadores, EntradaBloqueo, EntradaCrearClase, FilaAgendaProfesor } from './tipos';
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
  FRECUENCIAS,
  LARGO_MAX_MOTIVO_BLOQUEO,
  LARGO_MAX_OBSERVACION,
  MAX_DIAS_BLOQUEO,
  MENSAJES_BLOQUEO,
  MENSAJES_PANEL,
  TIPOS_CLASE,
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
  FilaAgendaProfesor,
  Frecuencia,
  TipoClase,
} from './tipos';
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

/** Contadores de pendientes del profesor (AVI-01). */
export function useContadores(): { lectura: EstadoLecturaPanel<Contadores>; recargar: () => void } {
  return useContadoresConLector(LECTOR_CONTADORES_REAL);
}
