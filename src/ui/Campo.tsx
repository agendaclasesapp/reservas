import { useId, type ChangeEvent } from 'react';
import estilos from './Campo.module.css';

export type TipoCampo = 'text' | 'email' | 'tel' | 'date' | 'password' | 'number' | 'search';

export type CampoProps = {
  /** Si no se pasa, se genera uno. Los mensajes de ayuda y error derivan de este id. */
  id?: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  tipo?: TipoCampo;
  /** Mensaje de error ya redactado (qué pasó y qué hacer). Vacío o ausente: sin error. */
  error?: string;
  ayuda?: string;
  requerido?: boolean;
  deshabilitado?: boolean;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric' | 'decimal' | 'search' | 'none';
  /** Solo para `tipo="date"`: AAAA-MM-DD. */
  min?: string;
  max?: string;
  name?: string;
};

/** Campo de texto con `<label>` visible, ayuda y error asociados (A11Y-20, A11Y-21). */
export function Campo({
  id,
  etiqueta,
  valor,
  onCambio,
  tipo = 'text',
  error,
  ayuda,
  requerido = false,
  deshabilitado = false,
  autoComplete,
  inputMode,
  min,
  max,
  name,
}: CampoProps) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  const hayError = error !== undefined && error !== '';
  const describedBy = [ayuda ? idAyuda : null, hayError ? idError : null].filter(Boolean).join(' ');

  return (
    <div className={estilos.campo}>
      <label htmlFor={idCampo} className={estilos.etiqueta}>
        {etiqueta}
        {requerido ? <span className={estilos.requerido}> (obligatorio)</span> : null}
      </label>
      {ayuda ? (
        <p id={idAyuda} className={estilos.ayuda}>
          {ayuda}
        </p>
      ) : null}
      <input
        id={idCampo}
        name={name}
        type={tipo}
        className={`${estilos.entrada} ${hayError ? estilos.conError : ''}`}
        value={valor}
        onChange={(evento: ChangeEvent<HTMLInputElement>) => onCambio(evento.target.value)}
        aria-required={requerido || undefined}
        aria-invalid={hayError || undefined}
        aria-describedby={describedBy || undefined}
        disabled={deshabilitado}
        autoComplete={autoComplete}
        inputMode={inputMode}
        min={min}
        max={max}
      />
      {hayError ? (
        <p id={idError} role="alert" className={estilos.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
