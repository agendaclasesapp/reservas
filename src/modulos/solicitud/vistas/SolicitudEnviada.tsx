// Confirmación del pedido (SOL-01, RES-05): la solicitud queda pendiente y el hueco ocupado hasta que el profesor
// responde; si fue una serie, qué fechas se reservaron y cuáles se saltearon. Recibe el foco al aparecer porque
// reemplaza al formulario (el botón que lo tenía ya no existe).
import { useEffect, useRef } from 'react';
import { Alerta } from '../../../ui';
import { textoFecha, textoHora, textoHorario } from './formato';
import type { TipoClase } from './SolicitudForm';
import estilos from './SolicitudEnviada.module.css';

export type SolicitudEnviadaProps = {
  profesorNombre: string;
  zona: string;
  hueco: { inicio: string; fin: string };
  tipo: TipoClase;
  /** Inicios de las clases que quedaron pedidas (`solicitar_reserva.fechas`). */
  fechas: readonly string[];
  /** Inicios de las fechas que se saltearon (`solicitar_reserva.salteadas`, RES-05). */
  salteadas: readonly string[];
};

const FRASE_TIPO: Record<TipoClase, string> = {
  suelta: 'la clase del',
  semanal: 'la serie semanal desde el',
  quincenal: 'la serie quincenal desde el',
};

export function SolicitudEnviada({ profesorNombre, zona, hueco, tipo, fechas, salteadas }: SolicitudEnviadaProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className={estilos.enviada}>
      <Alerta tipo="exito" titulo="Pedido enviado">
        Pediste {FRASE_TIPO[tipo]} {textoHorario(hueco.inicio, hueco.fin, zona)}. {profesorNombre} tiene que
        confirmarla; mientras tanto el horario queda ocupado.
      </Alerta>
      {tipo !== 'suelta' ? (
        <p className={estilos.texto}>
          {fechas.length === 1 ? 'Quedó pedida 1 fecha' : `Quedaron pedidas ${fechas.length} fechas`}; la serie sigue
          hasta que se cancele.
        </p>
      ) : null}
      {salteadas.length > 0 ? (
        <div>
          <p className={estilos.texto}>
            {salteadas.length === 1 ? 'Esta fecha no se pidió porque no estaba libre' : 'Estas fechas no se pidieron porque no estaban libres'}:
          </p>
          <ul className={estilos.lista} aria-label="Fechas que se saltearon">
            {salteadas.map((inicio) => (
              <li key={inicio}>
                {textoFecha(inicio, zona, hueco.inicio)}, {textoHora(inicio, zona)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className={estilos.texto}>
        <a href="#/mis-clases" className={estilos.enlace}>
          Ver Mis clases
        </a>
      </p>
    </div>
  );
}
