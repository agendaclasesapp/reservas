import { useId, type ChangeEvent } from 'react';
import estilos from './GrupoOpciones.module.css';

export type OpcionGrupo = {
  valor: string;
  etiqueta: string;
  ayuda?: string;
};

export type GrupoOpcionesProps = {
  /** Pregunta o título del grupo; es el nombre accesible del `fieldset`. */
  legend: string;
  opciones: ReadonlyArray<OpcionGrupo>;
  /** Valor elegido; cadena vacía = ninguno. */
  valor: string;
  onCambio: (valor: string) => void;
  /** Mensaje de error ya redactado. Vacío o ausente: sin error. */
  error?: string;
  requerido?: boolean;
  deshabilitado?: boolean;
  /** Nombre del grupo de radios; si no se pasa se genera uno. */
  name?: string;
};

/** Grupo de opciones excluyentes: `<fieldset><legend>` con radios nativos (las flechas cambian la elegida). */
export function GrupoOpciones({
  legend,
  opciones,
  valor,
  onCambio,
  error,
  requerido = false,
  deshabilitado = false,
  name,
}: GrupoOpcionesProps) {
  const idGenerado = useId();
  const nombre = name ?? idGenerado;
  const idError = `${idGenerado}-error`;
  const hayError = error !== undefined && error !== '';

  return (
    <fieldset
      role="radiogroup"
      className={estilos.grupo}
      disabled={deshabilitado}
      aria-required={requerido || undefined}
      aria-invalid={hayError || undefined}
      aria-describedby={hayError ? idError : undefined}
    >
      <legend className={estilos.leyenda}>
        {legend}
        {requerido ? <span className={estilos.requerido}> (obligatorio)</span> : null}
      </legend>
      {opciones.map((opcion) => {
        const idOpcion = `${idGenerado}-${opcion.valor}`;
        const idAyuda = `${idOpcion}-ayuda`;
        return (
          <div key={opcion.valor} className={estilos.opcion}>
            <label htmlFor={idOpcion} className={estilos.fila}>
              <input
                id={idOpcion}
                type="radio"
                name={nombre}
                value={opcion.valor}
                className={estilos.radio}
                checked={valor === opcion.valor}
                onChange={(evento: ChangeEvent<HTMLInputElement>) => onCambio(evento.target.value)}
                aria-describedby={opcion.ayuda ? idAyuda : undefined}
              />
              <span>{opcion.etiqueta}</span>
            </label>
            {opcion.ayuda ? (
              <p id={idAyuda} className={estilos.ayuda}>
                {opcion.ayuda}
              </p>
            ) : null}
          </div>
        );
      })}
      {hayError ? (
        <p id={idError} role="alert" className={estilos.error}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
