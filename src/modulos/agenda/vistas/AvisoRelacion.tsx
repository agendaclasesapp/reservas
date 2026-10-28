// Aviso sobre la relación de quien mira con el profesor de la agenda (WEB-01, ALU-03, ALU-14, DEC-28): una
// persona con la ficha incompleta, o con el vínculo pendiente o rechazado, ve su estado con ESE profesor y no
// puede pedir. Presentación pura: la relación la calcula `relacionConProfesor` (src/estado). El nombre del
// profesor y el motivo del rechazo se muestran como texto (SEC-16).
import type { Ref } from 'react';
import type { RelacionConProfesor } from '../../../estado';
import { Alerta } from '../../../ui';
import estilos from './AvisoRelacion.module.css';

export type AvisoRelacionProps = {
  relacion: RelacionConProfesor;
  /** Nombre público del profesor de la agenda. */
  nombre: string;
  /** Para llevar el foco al aviso cuando aparece tras pedir acceso (el formulario desaparece). */
  avisoRef?: Ref<HTMLDivElement>;
};

/** `null` si no hay nada que avisar: visitante, aprobado, profesor, Administrador o sin vínculo. */
export function AvisoRelacion({ relacion, nombre, avisoRef }: AvisoRelacionProps) {
  if (relacion.tipo === 'ficha_incompleta') {
    return (
      <div ref={avisoRef} tabIndex={-1} className={estilos.aviso}>
        <Alerta
          tipo="info"
          titulo="Completá tu ficha"
          accion={
            <a href="#/ficha" className={estilos.enlace}>
              Completar la ficha
            </a>
          }
        >
          Para pedir acceso a {nombre} primero completá tu ficha.
        </Alerta>
      </div>
    );
  }
  if (relacion.tipo !== 'vinculo') return null;
  const { estado, motivo_rechazo: motivo } = relacion.inscripcion;
  if (estado === 'pendiente') {
    return (
      <div ref={avisoRef} tabIndex={-1} className={estilos.aviso}>
        <Alerta tipo="info" titulo="Acceso pendiente">
          Pediste acceso a {nombre}. Cuando lo apruebe vas a poder pedirle clases.
        </Alerta>
      </div>
    );
  }
  if (estado === 'rechazado') {
    const motivoVisible = motivo?.trim() ? motivo.trim() : null;
    return (
      <div ref={avisoRef} tabIndex={-1} className={estilos.aviso}>
        <Alerta tipo="aviso" titulo="Acceso no aprobado">
          <p>{nombre} no aprobó tu acceso, así que no podés pedirle clases.</p>
          {motivoVisible !== null ? (
            <p>
              <strong>Motivo:</strong> <span className={estilos.motivo}>{motivoVisible}</span>
            </p>
          ) : null}
        </Alerta>
      </div>
    );
  }
  return null;
}
