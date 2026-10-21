import { Boton } from './Boton';
import { Icono } from './Icono';
import estilos from './ErrorCarga.module.css';

export type ErrorCargaProps = {
  /** Qué pasó y qué hacer, p. ej. "No se pudo cargar la agenda." (sistema-diseno.md §6). */
  mensaje: string;
  onReintentar: () => void;
  textoReintentar?: string;
};

/** Error de carga de una vista: `role="alert"` más botón "Reintentar". */
export function ErrorCarga({ mensaje, onReintentar, textoReintentar = 'Reintentar' }: ErrorCargaProps) {
  return (
    <div role="alert" className={estilos.error}>
      <p className={estilos.mensaje}>
        <Icono nombre="alerta" />
        <span>{mensaje}</span>
      </p>
      <Boton variante="secundario" onClick={onReintentar}>
        {textoReintentar}
      </Boton>
    </div>
  );
}
