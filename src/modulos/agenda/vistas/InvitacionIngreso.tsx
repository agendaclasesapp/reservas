// Invitación a ingresar (WEB-01, CA-46, P-04): un visitante sin sesión que toca un hueco libre ve este aviso con el
// acceso a la pantalla de ingreso (WEB-02). Es solo presentación: no llama a ninguna RPC, no crea ninguna solicitud
// ni pide ningún dato. El nombre del profesor se muestra como texto (SEC-16).
import { Dialogo } from '../../../ui';
import estilos from './InvitacionIngreso.module.css';

export type InvitacionIngresoProps = {
  /** Nombre público del profesor de la agenda. */
  nombre: string;
  /** Dirección de `#/ingreso` con `?volver=` a esta agenda, para volver al terminar de ingresar (WEB-02). */
  hrefIngreso: string;
  onCerrar: () => void;
};

export function InvitacionIngreso({ nombre, hrefIngreso, onCerrar }: InvitacionIngresoProps) {
  return (
    <Dialogo
      abierto
      titulo="Ingresá para pedir esta clase"
      onCerrar={onCerrar}
      acciones={
        <a href={hrefIngreso} className={estilos.ingresar}>
          Ingresar
        </a>
      }
    >
      <p className={estilos.texto}>
        Para pedirle una clase a {nombre} tenés que ingresar. Después volvés a esta agenda.
      </p>
    </Dialogo>
  );
}
