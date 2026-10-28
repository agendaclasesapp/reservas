// Observación opcional de la reserva (RES-04, SEC-09): texto libre de hasta 500 caracteres. Se muestra siempre como
// texto (SEC-16). Etiqueta visible, ayuda con el conteo y error asociados al campo (A11Y-20, A11Y-21).
import { forwardRef, useId, type ChangeEvent } from 'react';
import { LARGO_MAX_OBSERVACION } from '../logica';
import estilos from './CampoObservacion.module.css';

export type CampoObservacionProps = {
  valor: string;
  onCambio: (valor: string) => void;
  /** Mensaje ya redactado; vacío o ausente: sin error. */
  error?: string;
  deshabilitado?: boolean;
};

export const CampoObservacion = forwardRef<HTMLTextAreaElement, CampoObservacionProps>(function CampoObservacion(
  { valor, onCambio, error, deshabilitado = false },
  ref,
) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const hayError = error !== undefined && error !== '';
  const largo = valor.trim().length;
  return (
    <div className={estilos.campo}>
      <label htmlFor={id} className={estilos.etiqueta}>
        Observación <span className={estilos.opcional}>(opcional)</span>
      </label>
      <p id={idAyuda} className={estilos.ayuda}>
        Por ejemplo, quiénes más asisten a la clase. {largo} de {LARGO_MAX_OBSERVACION} caracteres.
      </p>
      <textarea
        id={id}
        ref={ref}
        rows={3}
        className={`${estilos.entrada} ${hayError ? estilos.conError : ''}`}
        value={valor}
        onChange={(evento: ChangeEvent<HTMLTextAreaElement>) => onCambio(evento.target.value)}
        aria-invalid={hayError || undefined}
        aria-describedby={hayError ? `${idAyuda} ${idError}` : idAyuda}
        disabled={deshabilitado}
      />
      {hayError ? (
        <p id={idError} role="alert" className={estilos.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
});
