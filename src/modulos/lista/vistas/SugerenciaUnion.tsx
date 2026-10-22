// Sugerencia de unión al aprobar una cuenta (WEB-07, ALU-04, ALU-05; componentes-profesor.md C-64).
// Muestra las dos fichas lado a lado y pide confirmar: nunca se une sin confirmar; «No unir» no cambia nada.
import { Alerta, Boton, Dialogo } from '../../../ui';
import { formatearNacimiento, nombreVisible, textoEdad, textoOpcional } from './formato';
import estilos from './SugerenciaUnion.module.css';

/** Ficha de un alumno para comparar; todo es texto plano (SEC-16). */
export type FichaComparada = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  mail: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
};

export type OcupadoUnion = { id: string; accion: 'unir' | 'descartar' } | null;

export type SugerenciaUnionProps = {
  /** La cuenta que se acaba de aprobar. */
  cuenta: FichaComparada;
  /** Alumnos sin cuenta con el mismo teléfono normalizado: uno o varios (DEC-03). */
  candidatos: readonly FichaComparada[];
  ocupado?: OcupadoUnion;
  /** Mensaje del módulo de la lista si la unión o el descarte falló. */
  error?: string;
  onUnir: (candidato: FichaComparada) => void;
  onDescartar: (candidato: FichaComparada) => void;
  /** «Decidir después»: cierra sin unir ni descartar. */
  onCerrar: () => void;
};

function Ficha({ ficha, titulo }: { ficha: FichaComparada; titulo: string }) {
  return (
    <div className={estilos.ficha}>
      <h3 className={estilos.subtitulo}>{titulo}</h3>
      <dl className={estilos.datos}>
        <div>
          <dt>Nombre</dt>
          <dd>{nombreVisible(ficha.nombre)}</dd>
        </div>
        <div>
          <dt>Teléfono</dt>
          <dd>{textoOpcional(ficha.telefono)}</dd>
        </div>
        <div>
          <dt>Mail</dt>
          <dd>{textoOpcional(ficha.mail)}</dd>
        </div>
        <div>
          <dt>Nacimiento</dt>
          <dd>
            {formatearNacimiento(ficha.fecha_nacimiento)} ({textoEdad(ficha.edad)})
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function SugerenciaUnion({
  cuenta,
  candidatos,
  ocupado = null,
  error,
  onUnir,
  onDescartar,
  onCerrar,
}: SugerenciaUnionProps) {
  const varios = candidatos.length > 1;
  const quien = nombreVisible(cuenta.nombre);
  return (
    <Dialogo abierto titulo="Posible alumno repetido" onCerrar={onCerrar} textoCerrar="Decidir después">
      <div className={estilos.cuerpo}>
        <p className={estilos.intro}>
          {varios
            ? `Hay ${candidatos.length} alumnos sin cuenta con el mismo teléfono que ${quien}. `
            : `Hay un alumno sin cuenta con el mismo teléfono que ${quien}. `}
          Si son la misma persona, sus clases, solicitudes e historial pasan a la cuenta aprobada y el alumno sin
          cuenta deja de existir. No se une nada sin tu confirmación.
        </p>
        {error ? <Alerta tipo="error">{error}</Alerta> : null}
        <ul className={estilos.candidatos}>
          {candidatos.map((candidato) => {
            const nombre = nombreVisible(candidato.nombre);
            const ocupadoAca = ocupado !== null && ocupado.id === candidato.id ? ocupado.accion : null;
            return (
              <li key={candidato.id} className={estilos.candidato}>
                <div className={estilos.fichas}>
                  <Ficha ficha={cuenta} titulo="Cuenta aprobada" />
                  <Ficha ficha={candidato} titulo="Alumno sin cuenta" />
                </div>
                <div className={estilos.acciones}>
                  <Boton
                    aria-label={`Unir cuentas: ${nombre}`}
                    cargando={ocupadoAca === 'unir'}
                    textoCargando="Uniendo…"
                    deshabilitado={ocupadoAca === 'descartar'}
                    onClick={() => onUnir(candidato)}
                  >
                    Unir cuentas
                  </Boton>
                  <Boton
                    variante="secundario"
                    aria-label={`No unir: ${nombre}`}
                    cargando={ocupadoAca === 'descartar'}
                    textoCargando="Descartando…"
                    deshabilitado={ocupadoAca === 'unir'}
                    onClick={() => onDescartar(candidato)}
                  >
                    No unir
                  </Boton>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialogo>
  );
}
