// Cuenta pendiente de aprobación (WEB-07, ALU-03; flujos-profesor.md F-11; componentes-profesor.md C-63).
// Ficha completa como texto plano (SEC-16): nombre, teléfono, mail, nacimiento con edad y cómo llegó.
import { Alerta, Boton } from '../../../ui';
import { nombreVisible, type AlumnoLista } from '../logica';
import { formatearNacimiento, textoEdad, textoOpcional } from './formato';
import estilos from './TarjetaCuenta.module.css';

export type AccionCuenta = 'aprobando' | 'rechazando';

export type TarjetaCuentaProps = {
  cuenta: AlumnoLista;
  /** Operación en curso sobre esta cuenta: el botón correspondiente queda `aria-busy`. */
  ocupada?: AccionCuenta | null;
  /** Error de la última operación, con el mensaje del módulo de la lista. */
  error?: string;
  /** false con el profesor inactivo (PRF-08): «Aprobar» queda deshabilitado. */
  puedeAprobar?: boolean;
  onAprobar: (cuenta: AlumnoLista) => void;
  onRechazar: (cuenta: AlumnoLista) => void;
};

export function TarjetaCuenta({ cuenta, ocupada = null, error, puedeAprobar = true, onAprobar, onRechazar }: TarjetaCuentaProps) {
  const nombre = nombreVisible(cuenta.nombre);
  const idTitulo = `cuenta-${cuenta.id}`;
  return (
    <article className={estilos.tarjeta} aria-labelledby={idTitulo}>
      <h3 id={idTitulo} className={estilos.titulo}>
        {nombre}
      </h3>
      <dl className={estilos.ficha}>
        <div>
          <dt>Teléfono</dt>
          <dd>{textoOpcional(cuenta.telefono)}</dd>
        </div>
        <div>
          <dt>Mail</dt>
          <dd>{textoOpcional(cuenta.mail)}</dd>
        </div>
        <div>
          <dt>Fecha de nacimiento</dt>
          <dd>
            {formatearNacimiento(cuenta.fecha_nacimiento)} ({textoEdad(cuenta.edad)})
          </dd>
        </div>
        <div>
          <dt>Cómo llegó</dt>
          <dd>{textoOpcional(cuenta.como_llego)}</dd>
        </div>
      </dl>
      {error ? <Alerta tipo="error">{error}</Alerta> : null}
      <div className={estilos.acciones}>
        <Boton
          aria-label={`Aprobar cuenta de ${nombre}`}
          cargando={ocupada === 'aprobando'}
          textoCargando="Aprobando…"
          deshabilitado={!puedeAprobar || ocupada === 'rechazando'}
          onClick={() => onAprobar(cuenta)}
        >
          Aprobar
        </Boton>
        <Boton
          variante="peligro"
          aria-label={`Rechazar cuenta de ${nombre}`}
          deshabilitado={ocupada !== null}
          onClick={() => onRechazar(cuenta)}
        >
          Rechazar
        </Boton>
      </div>
    </article>
  );
}
