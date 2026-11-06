// Textos y formatos de las vistas del panel del profesor (WEB-06, PRF-01..05, PRF-08, AVI-01; F-07 y F-08).
// Todo lo que viene de la base (nombres, observaciones) se muestra como texto (SEC-16).
import { diaDeInstante, formatearFecha, formatearHora, type Instante } from '../../../lib/fechas';
import type { Alcance, FilaAgendaProfesor } from '../logica';
import type { ResultadoPanel } from './contrato';

export const TEXTOS_PANEL = {
  titulo: 'Panel',
  /** F-07 paso 2: contadores con texto, no solo un número. */
  sinSolicitudes: 'Sin solicitudes pendientes',
  sinCuentas: 'Sin cuentas pendientes',
  cargandoContadores: 'Cargando los pendientes…',
  errorContadores: 'No se pudieron cargar los pendientes.',
  errorAgenda: 'No se pudo cargar la agenda.',
  cargandoAgenda: 'Cargando los huecos del día…',
  /** B20 (CAL-19, WEB-16): la lista de la vista Semana. */
  cargandoAgendaSemana: 'Cargando los huecos de la semana…',
  sinHuecos: 'No hay huecos este día',
  sinHuecosAyuda: 'Elegí otro día para ver sus horarios.',
  tocarHueco: 'Tocá un horario para gestionarlo.',
  /** F-08 «Crear»: el aviso va solo si el titular tiene mail y puede recibirlo (AVI-04). */
  avisoMail: 'Se enviará un mail al titular',
  pedidoSinResponder: 'Tiene un pedido del alumno sin responder.',
  responderEnLista: 'Responder en la lista',
  yaPaso: 'Ya pasó',
  /** PRF-08: dentro del panel de acciones, junto al botón deshabilitado. */
  inactivoNoCrea: 'Con la agenda inactiva no podés crear clases.',
  inactivoNoMueve: 'Con la agenda inactiva no podés mover clases. Sí podés cancelarlas.',
  /** El alumno de la clase ya no está en la lista (borrado). */
  alumnoSinNombre: 'Alumno sin nombre',
  sinAlumnos: 'Todavía no tenés alumnos aprobados ni sin cuenta',
  sinAlumnosAyuda: 'Cuando aprobes una cuenta o des de alta a un alumno, lo vas a poder elegir acá.',
  sinCoincidencias: 'Ningún alumno coincide con esa búsqueda.',
  errorPersonas:
    'No pudimos ver si tiene personas a cargo. Si seguís, la clase queda a nombre del titular.',
  sinDestinos: 'No hay horarios libres ese día. Elegí otro día.',
  cargandoDestinos: 'Cargando los horarios libres…',
  errorDestinos: 'No se pudieron cargar los horarios libres.',
  diaFueraDeLimites: 'Ese día no está disponible. Elegí uno dentro del último año o del próximo.',
  elegirDestino: 'Elegí el horario de destino.',
} as const;

/** «10:00 a 11:00» en el huso del profesor. */
export function textoRango(fila: Pick<FilaAgendaProfesor, 'inicio' | 'fin'>, zona: string): string {
  return `${formatearHora(fila.inicio, zona)} a ${formatearHora(fila.fin, zona)}`;
}

/** «12/11 10:00»: día y mes con dos cifras y hora, en el huso del profesor (F-08, «Clase movida al 12/11 10:00»). */
export function fechaCorta(instante: Instante, zona: string): string {
  const [, mes, dia] = diaDeInstante(instante, zona).split('-');
  return `${dia}/${mes} ${formatearHora(instante, zona)}`;
}

/** «lunes, 2 de noviembre, 10:00». */
export function fechaConHora(instante: Instante, zona: string): string {
  return `${formatearFecha(instante, zona)}, ${formatearHora(instante, zona)}`;
}

/** «3 solicitudes pendientes» / «1 solicitud pendiente». */
export function textoSolicitudes(n: number): string {
  return n === 1 ? '1 solicitud pendiente' : `${n} solicitudes pendientes`;
}

/** «2 cuentas pendientes» / «1 cuenta pendiente». */
export function textoCuentas(n: number): string {
  return n === 1 ? '1 cuenta pendiente' : `${n} cuentas pendientes`;
}

/** Minúsculas y sin tildes, para el buscador de alumnos. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Textos de los bloqueos del panel (AGE-05, AGE-06, WEB-06, F-09). Los mensajes de la base están en `MENSAJES_BLOQUEO`. */
export const TEXTOS_BLOQUEO = {
  abrir: 'Bloquear horarios',
  tituloDialogo: 'Bloquear horarios',
  bloquearHueco: 'Bloquear este horario',
  tituloBloquearHueco: 'Bloquear el horario',
  tituloDesbloquear: 'Desbloquear el horario',
  ayudaBloquearHueco: 'Nadie va a poder pedirlo hasta que lo desbloquees.',
  ofrecerBloquear: '¿No querés que nadie pida este horario?',
  alcance: 'Qué querés bloquear',
  alcanceRango: 'Un rango de horas de un día',
  alcanceDias: 'Días completos',
  dia: 'Día',
  desde: 'Desde (HH:MM)',
  hasta: 'Hasta (HH:MM)',
  ayudaHora: 'Por ejemplo 09:00. «Hasta» puede ser 24:00 para llegar al fin del día.',
  primerDia: 'Primer día',
  ultimoDia: 'Último día',
  motivo: 'Motivo (opcional)',
  ayudaMotivo: 'Solo lo ves vos: el calendario público no lo muestra. Hasta 500 caracteres.',
  bloquear: 'Bloquear',
  bloqueando: 'Bloqueando…',
  volver: 'Volver',
  desbloquear: 'Desbloquear',
  desbloqueando: 'Desbloqueando…',
  tituloErrorBloquear: 'No se puede bloquear',
  tituloErrorDesbloquear: 'No se pudo desbloquear',
  verEnElPanel: ' (ver ese día en el panel)',
  /** El bloqueo puede abarcar más que el hueco tocado: se avisa antes de quitarlo. */
  avisoDesbloquear:
    'Al desbloquear, este horario y todos los que cubre el mismo bloqueo (pueden ser más horarios u otros días) vuelven a estar libres.',
  horaInicioInvalida: 'Escribí la hora de inicio como HH:MM, por ejemplo 09:00.',
  horaFinInvalida: 'Escribí la hora de fin como HH:MM, por ejemplo 12:00. Puede ser 24:00.',
  diaInvalido: 'Elegí un día.',
  ultimoAntesDelPrimero: 'El último día tiene que ser el mismo o uno posterior al primero.',
  motivoDe: 'Motivo',
  horarioDe: 'Horario',
} as const;

/** Textos del calendario del Panel (CAL-01, CAL-03, CAL-07, CAL-08, CAL-19; flujos F-CAL-01..03 y F-CAL-09). */
export const TEXTOS_CALENDARIO = {
  navegacion: 'Navegación del calendario',
  calendario: 'Calendario',
  dia: 'Día',
  semana: 'Semana',
  hoy: 'Hoy',
  diaAnterior: 'Día anterior',
  diaSiguiente: 'Día siguiente',
  /** Sufijo del nombre accesible de una flecha deshabilitada por el rango de la agenda (CAL-03, A11Y-49). */
  noDisponible: ', no disponible',
  verComoLista: 'Ver como lista',
  verComoCalendario: 'Ver como calendario',
  cargando: 'Cargando la agenda…',
  /** Texto visible de los bloques; se muestra en mayúsculas con CSS (CAL-07, CAL-08). */
  confirmada: 'Confirmada',
  pendiente: 'Pendiente',
  /** CC-07, CC-08, CC-10: el texto de cada estado (el color nunca es lo único, A11Y-41). */
  libre: 'Libre',
  bloqueado: 'Bloqueado',
  /** CC-10 · Leyenda (CAL-17). */
  leyenda: 'Leyenda del calendario',
  /** CC-11 · Ayuda: literal de WEB-14. */
  ayuda: 'Toque un horario libre para crear una clase; con el teclado, use las acciones del hueco',
  /** CAL-18 (día). */
  sinClasesDia: 'No hay clases este día',
  /** B20 · CAL-18 (Semana, también con la ventana de 3 días). */
  sinClasesSemana: 'No hay clases esta semana',
  /** B20 · A11Y-49: la flecha anterior y siguiente de la vista Semana en escritorio y de su ventana de 3 días (CAL-16). */
  semanaAnterior: 'Semana anterior',
  semanaSiguiente: 'Semana siguiente',
  tresDiasAnteriores: '3 días anteriores',
  tresDiasSiguientes: '3 días siguientes',
  /** B20 · CC-09 (CAL-10): el texto visible junto al eje; la línea es decorativa. */
  ahora: 'Ahora',
  /** B20 · CC-16 (DEC-45 A, P-3): un día de la lista fuera de hoy ± 366 no se pide ni tiene huecos. */
  diaFueraDelRango: 'Fuera del rango',
  /** H-B17-03 · nombre accesible del campo de fecha de la barra (CAL-03). */
  elegirDia: 'Elegir día',
  /** CC-06 · DEC-43 A: clase confirmada con una cancelación pedida y sin responder (texto, no solo color: NFR-11). */
  cancelacionPendiente: 'Cancelación pendiente',
  /** CC-14 · F-CAL-06 (A11Y-47): se anuncian en el `role=status` del Panel. */
  claseConfirmada: 'Clase confirmada',
  claseRechazada: 'Clase rechazada',
  /** CC-15 · F-CAL-10 (CAL-20, A11Y-47): «Copiar enlace de este día» y su resultado en `role=status`. */
  copiarEnlaceDia: 'Copiar enlace de este día',
  enlaceCopiado: 'Enlace copiado',
  enlaceNoCopiado: 'No se pudo copiar el enlace. Copialo a mano:',
  /** B21 · CC-07 (CAL-13, F-CAL-08): el texto de un hueco que es destino válido mientras se arrastra una clase. */
  soltarAca: 'Soltar acá',
} as const;

/**
 * Textos de «Mover» que comparten el formulario de «Mover» y la confirmación del arrastre (CAL-13, CA-87): un mismo
 * mensaje de error y un mismo anuncio de éxito sea cual sea el camino.
 */
export const TEXTOS_MOVER = {
  titulo: 'Mover clase',
  mover: 'Mover',
  cancelar: 'Cancelar',
  moviendo: 'Moviendo…',
  queMovemos: '¿Qué movemos?',
  errorTitulo: 'No se pudo mover; no se cambió nada',
  irALaLista: 'Ir a la lista',
  avisoMail: 'Si el titular tiene mail, le avisamos.',
} as const;

/** El anuncio de una clase movida (F-08): «Clase movida al 12/11 10:00» o, en una serie, «Serie movida: …». */
export function resultadoDeMovimiento(
  alcance: Alcance,
  destino: Instante,
  zona: string,
  salteadas: readonly string[],
): ResultadoPanel {
  const cuando = fechaCorta(destino, zona);
  return {
    mensaje: alcance === 'desde_aca' ? `Serie movida: la próxima clase pasa al ${cuando}` : `Clase movida al ${cuando}`,
    detalle: TEXTOS_MOVER.avisoMail,
    salteadas,
  };
}
