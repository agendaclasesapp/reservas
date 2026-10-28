// Un profesor en la lista del Administrador (WEB-10, ADM-03, ADM-05): nombre, mail, enlace con botón para copiarlo,
// estado (texto + ícono) y la acción inactivar o reactivar. Nombre y mail se muestran como texto (SEC-16).
import { useId } from 'react';
import { Boton, Insignia } from '../../../ui';
import type { ProfesorLista } from '../logica';
import { nombreProfesor, TEXTO_ACTIVO, TEXTO_INACTIVO } from './formato';
import estilos from './TarjetaProfesor.module.css';

export type TarjetaProfesorProps = {
  profesor: ProfesorLista;
  /** Hay un cambio de estado en curso (de este u otro profesor): las acciones quedan deshabilitadas. */
  ocupado: boolean;
  onCopiar: (profesor: ProfesorLista) => void;
  /** Abre la confirmación de inactivar (activo) o de reactivar (inactivo). */
  onCambiarEstado: (profesor: ProfesorLista) => void;
};

export function TarjetaProfesor({ profesor, ocupado, onCopiar, onCambiarEstado }: TarjetaProfesorProps) {
  const idBase = useId();
  const nombre = nombreProfesor(profesor);
  return (
    <li className={estilos.tarjeta}>
      <div className={estilos.cabecera}>
        <h3 id={`${idBase}-nombre`} className={estilos.titulo}>
          {nombre}
        </h3>
        {profesor.activo ? (
          <Insignia tipo="aprobada" texto={TEXTO_ACTIVO} />
        ) : (
          <Insignia tipo="cancelada" texto={TEXTO_INACTIVO} />
        )}
      </div>
      <dl className={estilos.ficha}>
        <div>
          <dt>Mail</dt>
          <dd>{profesor.mail}</dd>
        </div>
      </dl>
      <div className={estilos.enlace}>
        <label htmlFor={`${idBase}-enlace`} className={estilos.etiqueta}>
          {`Enlace de ${nombre}`}
        </label>
        <div className={estilos.fila}>
          <input
            id={`${idBase}-enlace`}
            className={estilos.campo}
            type="text"
            readOnly
            value={profesor.enlace}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Boton variante="secundario" aria-label={`Copiar enlace de ${nombre}`} onClick={() => onCopiar(profesor)}>
            Copiar enlace
          </Boton>
        </div>
      </div>
      <div className={estilos.acciones}>
        <Boton
          variante={profesor.activo ? 'peligro' : 'primario'}
          aria-label={`${profesor.activo ? 'Inactivar' : 'Reactivar'} a ${nombre}`}
          deshabilitado={ocupado}
          onClick={() => onCambiarEstado(profesor)}
        >
          {profesor.activo ? 'Inactivar' : 'Reactivar'}
        </Boton>
      </div>
    </li>
  );
}
