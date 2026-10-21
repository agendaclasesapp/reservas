import estilos from './Cargando.module.css';

export type CargandoProps = {
  /** Texto para lectores de pantalla. Por defecto "Cargando…". */
  etiqueta?: string;
  /** Cantidad de renglones de esqueleto (0 = solo indicador). */
  renglones?: number;
};

/** Indicador de carga: `role="status"` con texto oculto y esqueleto estático con movimiento reducido. */
export function Cargando({ etiqueta = 'Cargando…', renglones = 0 }: CargandoProps) {
  return (
    <div role="status" aria-busy="true" className={estilos.cargando}>
      <span className={estilos.soloLectores}>{etiqueta}</span>
      {renglones > 0 ? (
        <ul className={estilos.esqueleto} aria-hidden="true">
          {Array.from({ length: renglones }, (_, indice) => (
            <li key={indice} className={estilos.renglon} />
          ))}
        </ul>
      ) : (
        <span className={estilos.giro} aria-hidden="true" />
      )}
    </div>
  );
}
