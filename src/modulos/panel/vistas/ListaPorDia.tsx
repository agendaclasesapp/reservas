// CC-16 · Lista por día (CAL-19, WEB-16; CA-83; F-CAL-09; A11Y-50; SEC-16, SEC-35): «Ver como lista» de la vista Semana.
// Un `h3` por día («Lun 26/10», con «Hoy» en texto) y debajo la lista de huecos de ese día (`ListaAgendaProfesor`, con
// las mismas acciones y el mismo diálogo o columna). Los días llegan agrupados por la lógica (`agruparPorDia`, DEC-46) en
// el orden de la semana: un día sin huecos lo dice con texto y uno fuera de hoy ± 366 (DEC-45 A) dice «Fuera del rango».
// Nombres, observaciones y motivos de bloqueo los dibuja la lista como texto: nada se arma como HTML.
import type { GrupoDia } from '../logica';
import { diaCorto } from './calendario';
import { TEXTOS_CALENDARIO, TEXTOS_PANEL } from './formato';
import { ListaAgendaProfesor, type ListaAgendaProfesorProps } from './ListaAgendaProfesor';
import estilos from './ListaPorDia.module.css';

export type ListaPorDiaProps = Omit<ListaAgendaProfesorProps, 'filas' | 'nombre'> & {
  /** Un grupo por día visible, en orden (`agruparPorDia` de la lógica). */
  dias: readonly GrupoDia[];
};

export function ListaPorDia({ dias, ...lista }: ListaPorDiaProps) {
  return (
    <div className={estilos.dias}>
      {dias.map((grupo) => (
        <div key={grupo.dia} className={estilos.dia}>
          <h3 className={estilos.titulo}>
            {diaCorto(grupo.dia)}
            {grupo.esHoy ? (
              <>
                {' '}
                <span className={estilos.hoy}>· {TEXTOS_CALENDARIO.hoy}</span>
              </>
            ) : null}
          </h3>
          {!grupo.enRango ? (
            <p className={estilos.vacio}>{TEXTOS_CALENDARIO.diaFueraDelRango}</p>
          ) : grupo.filas.length === 0 ? (
            <p className={estilos.vacio}>{TEXTOS_PANEL.sinHuecos}</p>
          ) : (
            <ListaAgendaProfesor {...lista} filas={grupo.filas} nombre={`Huecos del ${diaCorto(grupo.dia)}`} />
          )}
        </div>
      ))}
    </div>
  );
}
