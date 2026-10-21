import { Campo, type CampoProps } from './Campo';

export type CampoFechaProps = Omit<CampoProps, 'tipo' | 'inputMode'>;

/**
 * Campo de fecha nativo (`<input type="date">`) con etiqueta, ayuda y error de `Campo`.
 * `valor`, `min` y `max` van en AAAA-MM-DD; `valor` vacío es "sin fecha". El selector de día de la agenda
 * (C-20) usa Calendar de React Aria y vive en el bolt de vistas.
 */
export function CampoFecha(props: CampoFechaProps) {
  return <Campo {...props} tipo="date" />;
}
