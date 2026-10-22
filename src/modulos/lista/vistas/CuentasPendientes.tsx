// Sección «Cuentas pendientes» (WEB-07, ALU-03; flujos-profesor.md F-11). Vacío: «No hay cuentas pendientes».
import { Vacio } from '../../../ui';
import type { AlumnoLista } from '../logica';
import { TarjetaCuenta, type AccionCuenta } from './TarjetaCuenta';
import estilos from './CuentasPendientes.module.css';

export type CuentasPendientesProps = {
  cuentas: readonly AlumnoLista[];
  /** Cuenta con una operación en curso y cuál. */
  ocupada?: { id: string; accion: AccionCuenta } | null;
  /** Errores por id de cuenta (mensajes del módulo de la lista). */
  errores?: Readonly<Record<string, string>>;
  onAprobar: (cuenta: AlumnoLista) => void;
  onRechazar: (cuenta: AlumnoLista) => void;
};

const ID_TITULO = 'cuentas-pendientes-titulo';

export function CuentasPendientes({ cuentas, ocupada = null, errores = {}, onAprobar, onRechazar }: CuentasPendientesProps) {
  return (
    <section aria-labelledby={ID_TITULO} className={estilos.seccion}>
      <h2 id={ID_TITULO} className={estilos.titulo}>
        Cuentas pendientes
      </h2>
      {cuentas.length === 0 ? (
        <Vacio nivel={3} titulo="No hay cuentas pendientes" />
      ) : (
        <>
          <p className={estilos.cuenta}>
            {cuentas.length === 1 ? '1 cuenta pendiente de aprobación' : `${cuentas.length} cuentas pendientes de aprobación`}
          </p>
          <ul className={estilos.lista}>
            {cuentas.map((cuenta) => (
              <li key={cuenta.id}>
                <TarjetaCuenta
                  cuenta={cuenta}
                  ocupada={ocupada !== null && ocupada.id === cuenta.id ? ocupada.accion : null}
                  error={errores[cuenta.id]}
                  onAprobar={onAprobar}
                  onRechazar={onRechazar}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
