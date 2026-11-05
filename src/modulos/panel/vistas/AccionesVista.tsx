// CC-15 · Acciones de la vista (CAL-19, CAL-20, WEB-16, CA-84; F-CAL-09, F-CAL-10; A11Y-47, A11Y-49): «Ver como lista» ↔
// «Ver como calendario» cambia el texto, no solo el ícono (A11Y-49); es estado local del Panel, no va en la dirección,
// y el foco queda en el botón (es el mismo elemento y cambia su nombre). «Copiar enlace de este día» solo se ofrece en la
// vista Día (`copiable`) y queda deshabilitado, con su porqué en el nombre, si no hay enlace (`hayEnlace`: el slug no
// pasó la validación). El resultado se anuncia en un `role=status` presente desde el primer render, sin mover el foco:
// «Enlace copiado» o, si el navegador no deja copiar, el aviso con el enlace como texto para copiarlo a mano (como
// «Copiar enlace» de Configuración, A11Y-30). El enlace se muestra como texto (SEC-16).
import { Boton } from '../../../ui';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './AccionesVista.module.css';

export type ResultadoCopia = 'ninguno' | 'copiado' | 'fallo';

export type AccionesVistaProps = {
  /** true cuando se muestra la lista de huecos en lugar de la grilla. */
  modoLista: boolean;
  onModo: () => void;
  /** Solo en la vista Día: ofrece «Copiar enlace de este día». */
  copiable?: boolean;
  /** false: no hay enlace válido y el botón queda deshabilitado. */
  hayEnlace?: boolean;
  onCopiar?: () => void;
  /** Resultado de la última copia (`copiado` = «Enlace copiado»). */
  copia?: ResultadoCopia;
  /** El enlace, para copiarlo a mano si falló la copia. */
  enlace?: string | null;
};

export function AccionesVista({
  modoLista,
  onModo,
  copiable = false,
  hayEnlace = false,
  onCopiar,
  copia = 'ninguno',
  enlace = null,
}: AccionesVistaProps) {
  return (
    <div className={estilos.acciones}>
      <Boton variante="secundario" onClick={onModo}>
        {modoLista ? TEXTOS_CALENDARIO.verComoCalendario : TEXTOS_CALENDARIO.verComoLista}
      </Boton>
      {copiable ? (
        <>
          <Boton
            variante="secundario"
            deshabilitado={!hayEnlace}
            aria-label={hayEnlace ? undefined : `${TEXTOS_CALENDARIO.copiarEnlaceDia}${TEXTOS_CALENDARIO.noDisponible}`}
            onClick={() => onCopiar?.()}
          >
            {TEXTOS_CALENDARIO.copiarEnlaceDia}
          </Boton>
          {/* Región siempre montada para que el resultado se anuncie sin mover el foco. */}
          <p role="status" className={copia === 'fallo' ? estilos.fallo : estilos.resultado}>
            {copia === 'copiado' ? TEXTOS_CALENDARIO.enlaceCopiado : null}
            {copia === 'fallo' ? `${TEXTOS_CALENDARIO.enlaceNoCopiado} ${enlace ?? ''}`.trim() : null}
          </p>
        </>
      ) : null}
    </div>
  );
}
