// C-21 FilaHueco, C-22 ListaHuecos y C-23 LeyendaEstados (WEB-01, AGE-07, NFR-05).
// El estado se dice con texto + ícono + patrón, nunca solo con color. Los huecos son públicos: solo
// hora y estado, sin nombres, observaciones ni motivos (AGE-07).
import { IconoEstado } from '../../../ui';
import { diaDeInstante, formatearFecha, formatearHora, type Dia } from '../../../lib/fechas';
import { ESTADOS_HUECO, type Hueco } from '../logica';
import estilos from './ListaHuecos.module.css';

/** Una hora termina en el mismo día que empieza el hueco aunque `fin` caiga justo a medianoche (fin exclusivo). */
function diaDelFin(fin: string, zona: string): Dia {
  return diaDeInstante(new Date(Date.parse(fin) - 1), zona);
}

/** «10:00 a 11:00»; si el hueco entra o sale del día mostrado, la hora lleva su fecha (clases que cruzan medianoche). */
export function textoRango(hueco: Hueco, dia: Dia, zona: string): string {
  const desde = formatearHora(hueco.inicio, zona);
  const hasta = formatearHora(hueco.fin, zona);
  const conFechaDesde = diaDeInstante(hueco.inicio, zona) !== dia;
  const conFechaHasta = diaDelFin(hueco.fin, zona) !== dia;
  const inicio = conFechaDesde ? `${formatearFecha(hueco.inicio, zona)}, ${desde}` : desde;
  const fin = conFechaHasta ? `${formatearFecha(new Date(Date.parse(hueco.fin) - 1), zona)}, ${hasta}` : hasta;
  return `${inicio} a ${fin}`;
}

export type FilaHuecoProps = {
  hueco: Hueco;
  dia: Dia;
  zona: string;
  /** Si se pasa, el hueco libre es un botón; ocupado y bloqueado nunca son interactivos (F-01 paso 5). */
  onElegir?: (hueco: Hueco) => void;
};

export function FilaHueco({ hueco, dia, zona, onElegir }: FilaHuecoProps) {
  const rango = textoRango(hueco, dia, zona);
  const contenido = (
    <>
      <span className={estilos.hora}>{rango}</span> <IconoEstado estado={hueco.estado} />
    </>
  );
  const clase = `${estilos.fila} ${estilos[hueco.estado]}`;
  if (onElegir && hueco.estado === 'libre') {
    return (
      <li className={estilos.item}>
        <button type="button" className={`${clase} ${estilos.boton}`} onClick={() => onElegir(hueco)}>
          {contenido}
        </button>
      </li>
    );
  }
  return (
    <li className={`${estilos.item} ${clase}`} data-estado={hueco.estado}>
      {contenido}
    </li>
  );
}

/** Leyenda de los tres estados: sirve a quien no distingue colores (CA-37). */
export function LeyendaEstados() {
  return (
    <ul className={estilos.leyenda} aria-label="Significado de los estados">
      {ESTADOS_HUECO.map((estado) => (
        <li key={estado}>
          <IconoEstado estado={estado} />
        </li>
      ))}
    </ul>
  );
}

export type ListaHuecosProps = {
  huecos: readonly Hueco[];
  dia: Dia;
  zona: string;
  onElegir?: (hueco: Hueco) => void;
};

/** Texto de un solo renglón para lectores de pantalla: cuántos huecos libres hay. */
export function resumenHuecos(huecos: readonly Hueco[]): string {
  const libres = huecos.filter((h) => h.estado === 'libre').length;
  if (libres === 0) return `No hay huecos libres este día. Hay ${huecos.length} en total.`;
  return `${libres} ${libres === 1 ? 'hueco libre' : 'huecos libres'} de ${huecos.length}.`;
}

export function ListaHuecos({ huecos, dia, zona, onElegir }: ListaHuecosProps) {
  const ordenados = [...huecos].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  return (
    <div className={estilos.lista}>
      <LeyendaEstados />
      <ul className={estilos.huecos} aria-label="Huecos del día">
        {ordenados.map((hueco) => (
          <FilaHueco key={`${hueco.inicio}|${hueco.fin}|${hueco.estado}`} hueco={hueco} dia={dia} zona={zona} onElegir={onElegir} />
        ))}
      </ul>
    </div>
  );
}
