// B23 · T23.2 · Precarga del Panel (NFR-10, CA-88; el patrón de la agenda pública, B13 · T13.2, DEC-41). Si la
// dirección inicial es `#/panel…`, `agenda_profesor_dias` del rango que se puede suponer desde `v=` y `d=` sale en
// cuanto hay una sesión guardada, sin esperar `sesion_actual` ni `config_publica`. El rango exacto depende del huso
// del profesor (hoy y hoy ± 366, CAL-03) y del ancho de la pantalla (CAL-16), así que se supone con el huso del
// navegador y el ancho de ahora; `useAgendaDias` usa esa respuesta solo si el rango que resulta con la configuración
// es el mismo y la sesión es la misma con la que se pidió. Si no, la descarta sin mostrarla y lee como siempre.
// INV-02: la RPC no cambia (el profesor sale de la sesión en la base) y una respuesta pedida con otra sesión no se
// usa. Los errores no se tratan acá: los muestra quien toma la precarga, igual que los de una lectura propia.
import { haySesionGuardadaEnNavegador } from '../../../estado/sesion-actual';
import type { Dia } from '../../../lib/fechas';
import { ANCHO_MINIMO_SEMANA_REM, type RangoDias } from './semana';
import type { FilaAgendaDias } from './tipos';
import type { LectorAgendaDias } from './useAgendaDias';
import { limitesPanel, navegacionCalendario, vistaDesdeDireccion } from './vistaCalendario';

/** Una precarga que nadie tomó en este tiempo ya no se usa: el calendario vuelve a pedir el rango. */
export const VIGENCIA_PRECARGA_PANEL_MS = 30_000;

/** Id del usuario de la sesión de supabase-js (sin ir al servidor), o null sin sesión. */
export type UsuarioDeSesion = () => Promise<string | null>;

export interface DependenciasPrecargaPanel {
  /** El mismo lector que usa `useAgendaDias`: una precarga de otro lector no se toma. */
  lector: LectorAgendaDias;
  usuarioActual: UsuarioDeSesion;
}

export interface OpcionesRangoSupuesto {
  ahora?: Date;
  /** Huso con el que se supone «hoy»; por defecto, el del navegador. */
  zona?: string;
  /** CAL-16: la Semana es la ventana de 3 días; por defecto, si la pantalla mide menos de 60 rem. */
  ventana?: boolean;
}

export interface OpcionesPrecargaPanel extends DependenciasPrecargaPanel, OpcionesRangoSupuesto {
  /** Por defecto, si el navegador guarda una sesión de supabase-js (ADR-017: sin ella no se carga supabase-js). */
  haySesionGuardada?: () => boolean;
}

interface Entrada extends RangoDias {
  lector: LectorAgendaDias;
  usuarioActual: UsuarioDeSesion;
  /** Usuario de la sesión con la que se pidió; null: no había sesión y no se pidió nada. */
  usuario: Promise<string | null>;
  filas: Promise<FilaAgendaDias[] | null>;
  creada: number;
  fallo: boolean;
}

let precarga: Entrada | null = null;

function vigente(entrada: Entrada): boolean {
  return Date.now() - entrada.creada <= VIGENCIA_PRECARGA_PANEL_MS;
}

function zonaDelNavegador(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** El mismo corte que `useEscritorio` de las vistas: sin `matchMedia`, ventana de 3 días. */
function ventanaAhora(): boolean {
  return !(
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(`(min-width: ${ANCHO_MINIMO_SEMANA_REM}rem)`).matches
  );
}

function usuarioSeguro(usuarioActual: UsuarioDeSesion): Promise<string | null> {
  return Promise.resolve()
    .then(usuarioActual)
    .catch(() => null);
}

/**
 * Rango que leerá el calendario para los parámetros de la dirección (`v=`, `d=`), calculado como `PaginaPanel`
 * (`vistaDesdeDireccion` y `navegacionCalendario`) pero con el huso del navegador en lugar del del profesor.
 */
export function rangoSupuesto(parametros: string, opciones: OpcionesRangoSupuesto = {}): RangoDias {
  const limites = limitesPanel(opciones.zona ?? zonaDelNavegador(), opciones.ahora ?? new Date());
  const { vista, dia } = vistaDesdeDireccion(parametros, limites);
  const { desde, hasta } = navegacionCalendario({ vista, dia }, limites, { ventana: opciones.ventana ?? ventanaAhora() });
  return { desde, hasta };
}

/**
 * Pide `[desde, hasta]` con `lector` si hay usuario en la sesión. Repetirla con el mismo rango y lector mientras la
 * anterior está vigente y no falló no repite el pedido.
 */
export function precargarAgendaDias(desde: Dia, hasta: Dia, deps: DependenciasPrecargaPanel): void {
  const existente = precarga;
  if (
    existente !== null &&
    existente.desde === desde &&
    existente.hasta === hasta &&
    existente.lector === deps.lector &&
    !existente.fallo &&
    vigente(existente)
  ) {
    return;
  }
  const usuario = usuarioSeguro(deps.usuarioActual);
  const entrada: Entrada = {
    desde,
    hasta,
    lector: deps.lector,
    usuarioActual: deps.usuarioActual,
    usuario,
    filas: usuario.then((u) => (u === null ? null : deps.lector(desde, hasta))),
    creada: Date.now(),
    fallo: false,
  };
  // El error queda para quien tome la precarga; una precarga fallida no se reutiliza en la próxima.
  entrada.filas.then(
    () => undefined,
    () => {
      entrada.fallo = true;
    },
  );
  precarga = entrada;
}

/**
 * `#/panel?v=…&d=…` de la dirección inicial → precarga del rango supuesto (src/main.tsx la llama antes de esperar
 * la sesión y de montar el router). Otra dirección, o sin sesión guardada, no pide nada.
 */
export function precargarDesdeDireccion(hash: string, opciones: OpcionesPrecargaPanel): void {
  const ruta = hash.startsWith('#') ? hash.slice(1) : hash;
  const corte = ruta.indexOf('?');
  const pathname = corte === -1 ? ruta : ruta.slice(0, corte);
  if (pathname !== '/panel' && pathname !== '/panel/') return;
  if (!(opciones.haySesionGuardada ?? haySesionGuardadaEnNavegador)()) return;
  const { desde, hasta } = rangoSupuesto(corte === -1 ? '' : ruta.slice(corte + 1), opciones);
  precargarAgendaDias(desde, hasta, opciones);
}

/** La respuesta precargada si el usuario de la sesión sigue siendo el mismo; si no, una lectura propia. */
async function tomada(entrada: Entrada): Promise<FilaAgendaDias[]> {
  const [antes, ahora] = await Promise.all([entrada.usuario, usuarioSeguro(entrada.usuarioActual)]);
  if (antes === null || antes !== ahora) return entrada.lector(entrada.desde, entrada.hasta);
  return (await entrada.filas) ?? entrada.lector(entrada.desde, entrada.hasta);
}

/**
 * La precarga de `[desde, hasta]`, si la hay, está vigente y se pidió con el mismo `lector`; si no, null. La primera
 * búsqueda la olvida (se use o no), así que cambiar de rango o `recargar()` leen de nuevo. El olvido espera al final
 * de la tarea para que el doble montaje de StrictMode encuentre la misma.
 */
export function tomarPrecargaPanel(lector: LectorAgendaDias, desde: Dia, hasta: Dia): Promise<FilaAgendaDias[]> | null {
  const entrada = precarga;
  if (entrada === null) return null;
  setTimeout(() => {
    if (precarga === entrada) precarga = null;
  }, 0);
  if (entrada.lector !== lector || entrada.desde !== desde || entrada.hasta !== hasta || !vigente(entrada)) return null;
  return tomada(entrada);
}

/** Solo para pruebas: olvida la precarga. */
export function reiniciarPrecargaPanel(): void {
  precarga = null;
}
