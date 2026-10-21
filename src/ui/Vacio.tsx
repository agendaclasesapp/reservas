import type { ReactNode } from 'react';
import estilos from './Vacio.module.css';

export type VacioProps = {
  titulo: string;
  texto?: string;
  /** Acción sugerida (botón o enlace) ya construida por quien lo usa. */
  accion?: ReactNode;
  /** Nivel del encabezado según el contexto de la página. */
  nivel?: 2 | 3;
};

/** Listado sin elementos: encabezado, explicación y, si corresponde, una acción. */
export function Vacio({ titulo, texto, accion, nivel = 2 }: VacioProps) {
  const Encabezado = nivel === 2 ? 'h2' : 'h3';
  return (
    <div className={estilos.vacio}>
      <Encabezado className={estilos.titulo}>{titulo}</Encabezado>
      {texto ? <p className={estilos.texto}>{texto}</p> : null}
      {accion ? <div className={estilos.accion}>{accion}</div> : null}
    </div>
  );
}
