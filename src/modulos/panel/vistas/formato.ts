// Textos y formatos de las vistas del panel del profesor (WEB-06, PRF-01..05, PRF-08, AVI-01; F-07 y F-08).
// Todo lo que viene de la base (nombres, observaciones) se muestra como texto (SEC-16).
import { diaDeInstante, formatearFecha, formatearHora, type Instante } from '../../../lib/fechas';
import type { FilaAgendaProfesor } from '../logica';

export const TEXTOS_PANEL = {
  titulo: 'Panel',
  /** F-07 paso 2: contadores con texto, no solo un número. */
  sinSolicitudes: 'Sin solicitudes pendientes',
  sinCuentas: 'Sin cuentas pendientes',
  cargandoContadores: 'Cargando los pendientes…',
  errorContadores: 'No se pudieron cargar los pendientes.',
  errorAgenda: 'No se pudo cargar la agenda.',
  cargandoAgenda: 'Cargando los huecos del día…',
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
