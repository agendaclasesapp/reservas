// CC-15 · Acciones de la vista (CAL-19, WEB-16; F-CAL-09): «Ver como lista» ↔ «Ver como calendario». Cambia el texto,
// no solo el ícono (A11Y-49). Es estado local del Panel, no va en la dirección. El foco queda en el botón al cambiar
// de modo: el botón es el mismo elemento y cambia su nombre.
import { Boton } from '../../../ui';
import { TEXTOS_CALENDARIO } from './formato';
import estilos from './AccionesVista.module.css';

export type AccionesVistaProps = {
  /** true cuando se muestra la lista de huecos en lugar de la grilla. */
  modoLista: boolean;
  onModo: () => void;
};

export function AccionesVista({ modoLista, onModo }: AccionesVistaProps) {
  return (
    <div className={estilos.acciones}>
      <Boton variante="secundario" onClick={onModo}>
        {modoLista ? TEXTOS_CALENDARIO.verComoCalendario : TEXTOS_CALENDARIO.verComoLista}
      </Boton>
    </div>
  );
}
