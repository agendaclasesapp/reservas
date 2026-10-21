import estilos from './SinPermisos.module.css';

export type DestinoSinPermisos = {
  /** Texto del enlace, p. ej. "Ir a la ficha". */
  texto: string;
  /** Ruta de destino (hash), p. ej. "#/ficha". */
  href: string;
};

export type SinPermisosProps = {
  /** Por qué no puede ver la pantalla y qué hacer (ya redactado, con el estado si corresponde). */
  motivo: string;
  destino?: DestinoSinPermisos;
  /** Nivel del encabezado: 1 si ocupa toda la página (por defecto), 2 si va dentro de otra. */
  nivel?: 1 | 2;
};

/** Pantalla "Sin permisos": encabezado, motivo y enlace de salida. No redirige en silencio (flujos.md §1). */
export function SinPermisos({ motivo, destino, nivel = 1 }: SinPermisosProps) {
  const Encabezado = nivel === 1 ? 'h1' : 'h2';
  return (
    <section className={estilos.sinPermisos}>
      <Encabezado className={estilos.titulo}>Sin permisos</Encabezado>
      <p className={estilos.motivo}>{motivo}</p>
      {destino ? (
        <p className={estilos.destino}>
          <a href={destino.href} className={estilos.enlace}>
            {destino.texto}
          </a>
        </p>
      ) : null}
    </section>
  );
}
