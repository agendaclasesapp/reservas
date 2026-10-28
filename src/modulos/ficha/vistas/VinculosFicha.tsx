// «Tus profesores» en la ficha (WEB-03, ALU-03, ALU-14): el estado de aprobación con cada profesor, con el
// motivo del que rechazó si lo escribió. Sin vínculos, dice cómo conseguir uno sin listar profesores (WEB-09).
import { Vacio } from '../../../ui';
import type { VinculoFicha } from '../logica';
import { EstadoAprobacion } from './EstadoAprobacion';
import estilos from './VinculosFicha.module.css';

export type VinculosFichaProps = {
  /** `vinculosDeFicha(sesion)`: en el orden de `sesion_actual` (por nombre del profesor). */
  vinculos: readonly VinculoFicha[];
};

export const MENSAJE_SIN_VINCULOS = 'Todavía no pediste acceso a ningún profesor';
export const TEXTO_SIN_VINCULOS = 'Pedile el enlace a tu profesor y entrá desde ahí para pedirle acceso.';

export function VinculosFicha({ vinculos }: VinculosFichaProps) {
  // Una persona con sesión nunca es «sin cuenta» (no inicia sesión): ese estado no se muestra.
  const visibles = vinculos.flatMap((v) => (v.estado === 'sin_cuenta' ? [] : [{ ...v, estado: v.estado }]));
  return (
    <section aria-labelledby="ficha-vinculos-titulo" className={estilos.seccion}>
      <h2 id="ficha-vinculos-titulo">Tus profesores</h2>
      {visibles.length === 0 ? (
        <Vacio nivel={3} titulo={MENSAJE_SIN_VINCULOS} texto={TEXTO_SIN_VINCULOS} />
      ) : (
        <ul className={estilos.lista}>
          {visibles.map((v) => (
            <li key={v.profesorId}>
              <EstadoAprobacion
                estado={v.estado}
                motivo={v.motivo}
                profesorNombre={v.profesorNombre}
                profesorActivo={v.profesorActivo}
                slug={v.slug}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
