// B19 · T19.1 · «Copiar enlace de este día» (CAL-20, CA-84; INV-03, SEC-16, SEC-36).
// El enlace es la agenda pública que ya existe (`…/#/p/<slug>`, el mismo que copia Configuración) con `?d=AAAA-MM-DD`:
// no suma datos al contenido público (INV-03). El slug sale de la sesión, se valida con la forma de ADM-02 y se
// codifica con `encodeURIComponent` (`rutaDeProfesor`); si no la cumple, no hay enlace y la acción se deshabilita.
import { normalizarSlug, useSesion } from '../../../estado';
import { esDia, type Dia } from '../../../lib/fechas';
import { copiarTexto, enlaceDeProfesor, profesorDeSesion } from '../../configuracion/logica';

/** Parámetro del día de la agenda pública (`PaginaAgenda`). */
export const PARAMETRO_DIA_PUBLICO = 'd';

/** Resultado de copiar: «Enlace copiado» o el fallo (sin permiso o sin contexto seguro). */
export type ResultadoCopiaEnlace = 'ok' | 'fallo';

/** Copia inyectable (por defecto, el portapapeles del navegador): `true` si copió. */
export type CopiarTexto = (texto: string) => Promise<boolean>;

/** ADM-02: el slug tal cual cumple la forma (3 a 30, minúsculas, dígitos y guiones internos, no reservado). */
export function slugValidoParaEnlace(slug: string | null | undefined): slug is string {
  return typeof slug === 'string' && normalizarSlug(slug) === slug;
}

/**
 * CAL-20: `origen + BASE_URL + #/p/<slug>?d=AAAA-MM-DD`, o `null` si el slug no cumple ADM-02 o el día no es
 * `AAAA-MM-DD` (SEC-16, SEC-36). `origen` y `base` son los del entorno (DEC-14); se pasan solo en pruebas.
 */
export function enlaceDia(slug: string | null | undefined, dia: Dia, origen?: string, base?: string): string | null {
  if (!slugValidoParaEnlace(slug) || !esDia(dia)) return null;
  return `${enlaceDeProfesor(slug, origen, base)}?${PARAMETRO_DIA_PUBLICO}=${encodeURIComponent(dia)}`;
}

/** Enlace del día con el slug del profesor de la sesión (INV-03); `null` sin profesor o con un slug inválido. */
export function useEnlaceDia(dia: Dia): string | null {
  return enlaceDia(profesorDeSesion(useSesion())?.slug, dia);
}

/** Copia el enlace; sin enlace (acción deshabilitada) o si el navegador no deja, `'fallo'`. No lanza. */
export async function copiarEnlaceDia(enlace: string | null, copiar: CopiarTexto = copiarTexto): Promise<ResultadoCopiaEnlace> {
  if (enlace === null) return 'fallo';
  try {
    return (await copiar(enlace)) ? 'ok' : 'fallo';
  } catch {
    return 'fallo';
  }
}
