// Selector de profesor (WEB-11, DEC-25, DEC-28): el layout lo monta arriba en las pantallas de la persona;
// con un solo vínculo no se pinta. Lista a sus profesores con el estado del vínculo con cada uno y, si está
// inactivo, «No toma reservas» (AGE-11). Elegir uno guarda el «profesor elegido» y abre su agenda (lo hace
// `elegir` de ../logica). Los nombres son texto (SEC-16). rutas.tsx lo importa (default, sin props).
import type { MouseEvent } from 'react';
import { Insignia, type TipoInsignia } from '../../../ui';
import { useSelectorProfesor, type OpcionProfesor } from '../logica';
import estilos from './Selector.module.css';

export const ETIQUETA_SELECTOR = 'Tus profesores';
export const TEXTO_INACTIVO = 'No toma reservas';

const INSIGNIA: Readonly<Record<OpcionProfesor['estado'], TipoInsignia>> = {
  pendiente: 'pendiente',
  aprobado: 'aprobada',
  rechazado: 'rechazada',
  sin_cuenta: 'sinCuenta',
};

/** Un clic con tecla modificadora o botón secundario queda para el navegador (abrir en otra pestaña). */
function esClicSimple(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export default function Selector() {
  const { visible, opciones, elegir } = useSelectorProfesor();
  if (!visible) return null;
  return (
    <nav aria-labelledby="selector-profesor-etiqueta" className={estilos.selector}>
      <p id="selector-profesor-etiqueta" className={estilos.etiqueta}>
        {ETIQUETA_SELECTOR}
      </p>
      <ul className={estilos.lista}>
        {opciones.map((o) => {
          const insignia = INSIGNIA[o.estado];
          return (
            <li key={o.slug}>
              <a
                href={`#${o.ruta}`}
                className={estilos.opcion}
                aria-current={o.actual ? 'page' : undefined}
                onClick={(e) => {
                  if (!esClicSimple(e)) return;
                  e.preventDefault();
                  elegir(o.slug);
                }}
              >
                <span className={estilos.nombre}>{o.profesorNombre}</span>
                <Insignia tipo={insignia} />
                {o.activo ? null : <span className={estilos.inactivo}>{TEXTO_INACTIVO}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
