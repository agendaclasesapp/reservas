// Enlace propio del profesor con un botón para copiarlo (WEB-08, AGE-09, DEC-14). El enlace abre su agenda con
// su nombre; si el navegador no deja copiar, el campo queda seleccionable para copiarlo a mano. Con el profesor
// inactivo (AGE-11) avisa que el enlace dice que no toma reservas. El enlace es texto de solo lectura.
import { useId, useState } from 'react';
import { Alerta, Boton } from '../../../ui';
import { copiarTexto } from '../logica';
import estilos from './EnlacePropio.module.css';

export type EnlacePropioProps = {
  /** `useEnlacePropio().enlace`: `…/reservas/#/p/<slug>`. */
  enlace: string;
  /** false: el profesor está inactivo y su enlace muestra que no toma reservas (AGE-11). */
  activo: boolean;
  /** Solo para pruebas; por defecto, el portapapeles del navegador. */
  copiar?: (texto: string) => Promise<boolean>;
};

type Resultado = 'ninguno' | 'copiado' | 'fallo';

export const TEXTO_COPIADO = 'Enlace copiado.';
export const TEXTO_NO_COPIADO = 'No se pudo copiar. Seleccioná el enlace y copialo a mano.';

export function EnlacePropio({ enlace, activo, copiar = copiarTexto }: EnlacePropioProps) {
  const idBase = useId();
  const [resultado, setResultado] = useState<Resultado>('ninguno');

  const alCopiar = async () => {
    setResultado((await copiar(enlace)) ? 'copiado' : 'fallo');
  };

  return (
    <section aria-labelledby={`${idBase}-titulo`} className={estilos.seccion}>
      <h2 id={`${idBase}-titulo`}>Tu enlace</h2>
      <p className={estilos.ayuda}>Compartilo con tus alumnos: abre tu agenda con tu nombre.</p>
      {activo ? null : (
        <Alerta tipo="aviso">
          Tu agenda está inactiva: quien abra tu enlace ve que no tomás reservas por ahora.
        </Alerta>
      )}
      <div className={estilos.fila}>
        <label htmlFor={`${idBase}-enlace`} className={estilos.etiqueta}>
          Enlace de tu agenda
        </label>
        <input
          id={`${idBase}-enlace`}
          className={estilos.campo}
          type="text"
          readOnly
          value={enlace}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Boton variante="secundario" onClick={() => void alCopiar()}>
          Copiar enlace
        </Boton>
      </div>
      {/* Región siempre montada para que el resultado se anuncie sin mover el foco. */}
      <p role="status" className={resultado === 'fallo' ? estilos.fallo : estilos.resultado}>
        {resultado === 'copiado' ? TEXTO_COPIADO : resultado === 'fallo' ? TEXTO_NO_COPIADO : ''}
      </p>
    </section>
  );
}
