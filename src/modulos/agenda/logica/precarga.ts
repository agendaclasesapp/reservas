// Precarga de la agenda pública (NFR-04, CA-36; B13 · T13.2, DEC-41): `config_publica` y `agenda_publica` salen a
// la vez en lugar de en serie. El día exacto depende de la configuración (huso, límites de SEC-09), así que la
// agenda se pide con el día que se puede suponer sin ella (el de `?d=` o el de hoy en el huso del navegador) y
// `useAgendaDia` usa esa respuesta solo si el día que resulta con la configuración es el mismo; si no (otro día,
// profesor inactivo, enlace no válido) la respuesta se descarta sin mostrarse y la agenda pide el día correcto
// como antes. Los errores no se tratan acá: los muestra quien consume la precarga, igual que una lectura propia.
import { normalizarSlug, slugDeRuta } from '../../../estado/profesor';
import { esDia, hoyEn, sumarDias, type Dia } from '../../../lib/fechas';
import { obtenerAgendaPublica, obtenerConfigPublica } from './api';
import { cargarConfigPublica, configPublicaEnCache } from './useConfigPublica';
import type { Hueco, ObtenerAgenda, ObtenerConfig } from './tipos';

/** Una precarga que nadie tomó en este tiempo ya no se usa: la agenda vuelve a pedir el día. */
export const VIGENCIA_PRECARGA_MS = 30_000;

/**
 * Ventana de días que seguro aceptan los límites de SEC-09 (de hoy − 366 a hoy + horizonte + 31, con el
 * horizonte en 0 como peor caso), con un día de holgura por la diferencia entre el huso del navegador y el del
 * profesor. Un `?d=` fuera de ella puede no ser válido: no se adivina y la agenda espera la configuración.
 */
const DIAS_ATRAS_SEGUROS = 365;
const DIAS_ADELANTE_SEGUROS = 30;

interface Entrada {
  slug: string;
  dia: Dia;
  obtener: ObtenerAgenda;
  promesa: Promise<Hueco[]>;
  creada: number;
  fallo: boolean;
}

const precargas = new Map<string, Entrada>();

function claveSlug(slug: string): string {
  return normalizarSlug(slug) ?? slug;
}

function claveDe(slug: string, dia: Dia): string {
  return `${claveSlug(slug)}|${dia}`;
}

function vigente(entrada: Entrada): boolean {
  return Date.now() - entrada.creada <= VIGENCIA_PRECARGA_MS;
}

function zonaDelNavegador(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Día que se pide antes de tener la configuración: el de `?d=` si cae en la ventana segura de SEC-09, hoy en el
 * huso del navegador si no hay `?d=` o no es un día (la agenda muestra hoy en esos casos), o `null` si `?d=` es
 * un día fuera de la ventana (puede ser válido o no según el horizonte: no se adivina).
 */
export function diaSupuesto(diaPedido: string | null, ahora: Date = new Date(), zona: string = zonaDelNavegador()): Dia | null {
  const hoy = hoyEn(zona, ahora);
  if (diaPedido === null || !esDia(diaPedido)) return hoy;
  const desde = sumarDias(hoy, -DIAS_ATRAS_SEGUROS, zona);
  const hasta = sumarDias(hoy, DIAS_ADELANTE_SEGUROS, zona);
  return diaPedido >= desde && diaPedido <= hasta ? diaPedido : null;
}

export interface OpcionesPrecarga {
  obtenerConfig?: ObtenerConfig;
  obtenerAgenda?: ObtenerAgenda;
  ahora?: Date;
  /** Huso con el que se supone «hoy»; por defecto, el del navegador. */
  zona?: string;
}

/**
 * Pide a la vez la configuración pública del profesor del `slug` (en la caché de `useConfigPublica`) y la agenda
 * del día supuesto. No hace nada con un slug que ningún profesor puede tener (AGE-09: da 404 sin red) ni si la
 * configuración ya está leída (la agenda sale en el mismo momento por su cuenta). Repetirla no repite pedidos.
 */
export function precargarAgendaPublica(slug: string, diaPedido: string | null, opciones: OpcionesPrecarga = {}): void {
  if (normalizarSlug(slug) === null) return;
  if (configPublicaEnCache(slug) !== null) return;
  void cargarConfigPublica(slug, opciones.obtenerConfig ?? obtenerConfigPublica).catch(() => undefined);
  const dia = diaSupuesto(diaPedido, opciones.ahora, opciones.zona);
  if (dia === null) return;
  const obtener = opciones.obtenerAgenda ?? obtenerAgendaPublica;
  const clave = claveDe(slug, dia);
  const existente = precargas.get(clave);
  if (existente && existente.obtener === obtener && !existente.fallo && vigente(existente)) return;
  const entrada: Entrada = {
    slug: claveSlug(slug),
    dia,
    obtener,
    promesa: Promise.resolve().then(() => obtener(slug, dia)),
    creada: Date.now(),
    fallo: false,
  };
  // El error queda para quien tome la precarga (lo muestra como el de una lectura propia); una precarga fallida
  // no se reutiliza en la próxima precarga (por ejemplo, tras reintentar la configuración).
  entrada.promesa.then(
    () => undefined,
    () => {
      entrada.fallo = true;
    },
  );
  precargas.set(clave, entrada);
}

/**
 * `#/p/<slug>?d=AAAA-MM-DD` de la dirección inicial → precarga de ese profesor (src/main.tsx la llama antes de
 * montar el router). Cualquier otra dirección no pide nada.
 */
export function precargarDesdeHash(hash: string, opciones: OpcionesPrecarga = {}): void {
  const ruta = hash.startsWith('#') ? hash.slice(1) : hash;
  const corte = ruta.indexOf('?');
  const pathname = corte === -1 ? ruta : ruta.slice(0, corte);
  const slug = slugDeRuta(pathname);
  if (slug === null) return;
  const diaPedido = corte === -1 ? null : new URLSearchParams(ruta.slice(corte + 1)).get('d');
  precargarAgendaPublica(slug, diaPedido, opciones);
}

/**
 * La precarga del día `dia` del profesor del `slug`, si la hay, está vigente y se pidió con el mismo `obtener`.
 * La primera vez que la agenda de un profesor la busca se olvidan todas las de ese profesor (se usen o no), así
 * que cambiar de día o volver más tarde lee de nuevo. El olvido espera al final de la tarea para que el doble
 * montaje de StrictMode encuentre la misma.
 */
export function tomarPrecargaAgenda(slug: string, dia: Dia, obtener: ObtenerAgenda): Promise<Hueco[]> | null {
  const delSlug = claveSlug(slug);
  const entrada = precargas.get(claveDe(slug, dia));
  const aOlvidar = [...precargas].filter(([, e]) => e.slug === delSlug);
  if (aOlvidar.length > 0) {
    setTimeout(() => {
      for (const [clave, e] of aOlvidar) if (precargas.get(clave) === e) precargas.delete(clave);
    }, 0);
  }
  if (!entrada || entrada.obtener !== obtener || !vigente(entrada)) return null;
  return entrada.promesa;
}

/** Solo para pruebas: olvida todas las precargas. */
export function reiniciarPrecargaAgenda(): void {
  precargas.clear();
}
