// Estado del vínculo con cada profesor en Mis clases (WEB-05, ALU-03, CA-45, SEC-16): el estado (texto + ícono),
// el motivo del profesor que rechazó —solo si lo escribió— junto a ese profesor y, si no toma reservas, que no
// toma reservas (AGE-11, CA-63). Los datos salen de `profesoresDeMisClases` (la sesión), sin duplicarlos.
import { rutaDeProfesor } from '../../../estado';
import { Insignia, type TipoInsignia } from '../../../ui';
import type { ProfesorDeMisClases } from '../logica';
import estilos from './EstadoVinculos.module.css';

export type EstadoVinculosProps = {
  profesores: readonly ProfesorDeMisClases[];
};

function insignia(estado: NonNullable<ProfesorDeMisClases['estado']>): TipoInsignia {
  if (estado === 'pendiente') return 'pendiente';
  if (estado === 'rechazado') return 'rechazada';
  return 'aprobada';
}

const ID_TITULO = 'mis-clases-vinculos';

export function EstadoVinculos({ profesores }: EstadoVinculosProps) {
  if (profesores.length === 0) return null;
  return (
    <section aria-labelledby={ID_TITULO} className={estilos.seccion}>
      <h2 id={ID_TITULO} className={estilos.titulo}>
        Tus profesores
      </h2>
      <ul className={estilos.lista}>
        {profesores.map((p) => (
          <li key={p.profesorId}>
            <article className={estilos.vinculo} aria-labelledby={`vinculo-${p.profesorId}`}>
              <h3 id={`vinculo-${p.profesorId}`} className={estilos.profesor}>
                {p.profesorNombre}
              </h3>
              <p className={estilos.estado}>
                {p.estado !== null ? <Insignia tipo={insignia(p.estado)} texto={p.textoEstado} /> : p.textoEstado}
              </p>
              {p.estado === 'rechazado' && p.motivoRechazo !== null ? (
                <p>
                  <strong>Motivo:</strong> <span className={estilos.textoMotivo}>{p.motivoRechazo}</span>
                </p>
              ) : null}
              {p.profesorActivo === false ? <p>No toma reservas por ahora.</p> : null}
              {p.estado !== null && p.slug !== null ? (
                <p>
                  <a href={`#${rutaDeProfesor(p.slug)}`} className={estilos.enlace}>
                    Ver la agenda de {p.profesorNombre}
                  </a>
                </p>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
