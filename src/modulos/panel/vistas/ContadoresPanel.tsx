// Contadores de pendientes del panel (AVI-01, WEB-06, F-07 paso 2): «3 solicitudes pendientes» y «1 cuenta
// pendiente», en texto y con enlace a `#/lista`. Un error de lectura no tapa la agenda: avisa y deja reintentar.
import { useId } from 'react';
import { Alerta, Boton } from '../../../ui';
import type { Contadores, EstadoLecturaPanel } from '../logica';
import { TEXTOS_PANEL, textoCuentas, textoSolicitudes } from './formato';
import estilos from './ContadoresPanel.module.css';

export type ContadoresPanelProps = {
  lectura: EstadoLecturaPanel<Contadores>;
  onReintentar: () => void;
};

const RUTA_LISTA = '#/lista';

function Contador({ cantidad, texto, sin }: { cantidad: number; texto: string; sin: string }) {
  return (
    <li className={estilos.item}>
      {cantidad > 0 ? (
        <a href={RUTA_LISTA} className={estilos.enlace}>
          {texto}
        </a>
      ) : (
        <span className={estilos.cero}>{sin}</span>
      )}
    </li>
  );
}

export function ContadoresPanel({ lectura, onReintentar }: ContadoresPanelProps) {
  const idTitulo = useId();
  const { datos } = lectura;
  return (
    <section aria-labelledby={idTitulo} className={estilos.contadores}>
      <h2 id={idTitulo} className={estilos.soloLectores}>
        Pendientes
      </h2>
      {datos ? (
        <ul className={estilos.lista}>
          <Contador
            cantidad={datos.solicitudes_pendientes}
            texto={textoSolicitudes(datos.solicitudes_pendientes)}
            sin={TEXTOS_PANEL.sinSolicitudes}
          />
          <Contador
            cantidad={datos.cuentas_pendientes}
            texto={textoCuentas(datos.cuentas_pendientes)}
            sin={TEXTOS_PANEL.sinCuentas}
          />
        </ul>
      ) : lectura.estado === 'error' ? (
        <Alerta
          tipo="error"
          accion={
            <Boton variante="secundario" onClick={onReintentar}>
              Reintentar
            </Boton>
          }
        >
          {`${TEXTOS_PANEL.errorContadores} ${lectura.error ?? ''}`.trim()}
        </Alerta>
      ) : (
        <p role="status" className={estilos.cargando}>
          {TEXTOS_PANEL.cargandoContadores}
        </p>
      )}
    </section>
  );
}
