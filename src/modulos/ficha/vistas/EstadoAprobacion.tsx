// Estado de aprobación de la cuenta en la ficha (WEB-03, ALU-03, SEC-16, CA-45). El motivo de rechazo es texto:
// React lo escapa y nunca se interpreta como HTML. Sin motivo, solo el estado.
import { Insignia } from '../../../ui';
import estilos from './EstadoAprobacion.module.css';

export type EstadoAprobacionProps = {
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  /** `sesion_actual().motivo_rechazo`: solo se muestra con `estado = "rechazado"`. */
  motivo: string | null;
};

const TEXTOS = {
  pendiente: {
    insignia: 'pendiente',
    rotulo: 'Pendiente de aprobación',
    detalle: 'Tu ficha está completa. El profesor tiene que aprobar tu cuenta para que puedas pedir clases.',
  },
  aprobado: {
    insignia: 'aprobada',
    rotulo: 'Aprobada',
    detalle: 'Tu cuenta está aprobada. Ya podés pedir clases desde la agenda.',
  },
  rechazado: {
    insignia: 'rechazada',
    rotulo: 'Rechazada',
    detalle: 'El profesor no aprobó tu cuenta, así que por ahora no podés pedir clases.',
  },
} as const;

/** Estado de la cuenta con texto e ícono (no solo color) y, si fue rechazada con motivo, el motivo. */
export function EstadoAprobacion({ estado, motivo }: EstadoAprobacionProps) {
  const textos = TEXTOS[estado];
  const motivoVisible = estado === 'rechazado' && motivo !== null && motivo.trim() !== '' ? motivo : null;
  return (
    <section className={estilos.estado} aria-labelledby="ficha-estado-titulo">
      <h2 id="ficha-estado-titulo">Estado de tu cuenta</h2>
      <p className={estilos.insignia}>
        <Insignia tipo={textos.insignia} texto={textos.rotulo} />
      </p>
      <p className={estilos.detalle}>{textos.detalle}</p>
      {motivoVisible !== null ? (
        <p className={estilos.motivo}>
          <strong>Motivo:</strong> <span className={estilos.textoMotivo}>{motivoVisible}</span>
        </p>
      ) : null}
    </section>
  );
}
