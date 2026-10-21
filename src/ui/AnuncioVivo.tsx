import estilos from './AnuncioVivo.module.css';

export type AnuncioVivoProps = {
  /** Texto a anunciar al lector de pantalla; vacío no anuncia nada. Cambiarlo dispara el anuncio. */
  mensaje: string;
};

/**
 * Región `aria-live="polite"` global (A11Y-24): se monta una sola vez, siempre en el DOM, para que los
 * cambios se anuncien sin mover el foco. Es invisible: lo visible va en `Alerta`.
 */
export function AnuncioVivo({ mensaje }: AnuncioVivoProps) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={estilos.region}>
      {mensaje}
    </div>
  );
}
