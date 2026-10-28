// Estado del vínculo con UN profesor en la ficha (WEB-03, ALU-03, SEC-16, CA-45): estado con texto e ícono, el
// motivo del profesor que rechazó (solo si lo escribió) y, si el profesor está inactivo, que no toma reservas
// (AGE-11). El nombre y el motivo son texto: React los escapa y nunca se interpretan como HTML.
import { rutaDeProfesor } from '../../../estado';
import { Insignia } from '../../../ui';
import estilos from './EstadoAprobacion.module.css';

export type EstadoAprobacionProps = {
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  /** Motivo escrito por el profesor: solo se muestra con `estado = "rechazado"`. */
  motivo: string | null;
  /** Nombre público del profesor (texto). */
  profesorNombre: string;
  /** false: el profesor no toma reservas por ahora. Por defecto, activo. */
  profesorActivo?: boolean;
  /** Si se pasa, agrega el enlace a la agenda de ese profesor. */
  slug?: string;
  /** Nivel del encabezado con el nombre del profesor. Por defecto 3 (dentro de «Tus profesores»). */
  nivel?: 2 | 3;
};

const ROTULO = {
  pendiente: { insignia: 'pendiente', texto: 'Pendiente de aprobación' },
  aprobado: { insignia: 'aprobada', texto: 'Aprobada' },
  rechazado: { insignia: 'rechazada', texto: 'Rechazada' },
} as const;

function detalle(estado: EstadoAprobacionProps['estado'], nombre: string): string {
  switch (estado) {
    case 'pendiente':
      return `${nombre} todavía tiene que aprobar tu acceso para que puedas pedirle clases.`;
    case 'aprobado':
      return 'Tu acceso está aprobado. Ya podés pedirle clases desde su agenda.';
    case 'rechazado':
      return `${nombre} no aprobó tu acceso, así que por ahora no podés pedirle clases.`;
  }
}

/** Vínculo con un profesor: nombre, estado (texto + ícono, no solo color), motivo y enlace a su agenda. */
export function EstadoAprobacion({
  estado,
  motivo,
  profesorNombre,
  profesorActivo = true,
  slug,
  nivel = 3,
}: EstadoAprobacionProps) {
  const rotulo = ROTULO[estado];
  const Encabezado = nivel === 2 ? 'h2' : 'h3';
  const motivoVisible = estado === 'rechazado' && motivo !== null && motivo.trim() !== '' ? motivo.trim() : null;
  return (
    <article className={estilos.estado}>
      <Encabezado className={estilos.profesor}>{profesorNombre}</Encabezado>
      <p className={estilos.insignia}>
        <Insignia tipo={rotulo.insignia} texto={rotulo.texto} />
      </p>
      <p className={estilos.detalle}>{detalle(estado, profesorNombre)}</p>
      {motivoVisible !== null ? (
        <p className={estilos.motivo}>
          <strong>Motivo:</strong> <span className={estilos.textoMotivo}>{motivoVisible}</span>
        </p>
      ) : null}
      {profesorActivo ? null : <p className={estilos.detalle}>No toma reservas por ahora.</p>}
      {slug !== undefined ? (
        <p className={estilos.detalle}>
          <a href={`#${rutaDeProfesor(slug)}`} className={estilos.enlace}>
            Ver la agenda de {profesorNombre}
          </a>
        </p>
      ) : null}
    </article>
  );
}
