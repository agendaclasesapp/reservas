// Editor de la grilla semanal (WEB-08, AGE-01, F-14, C-71): por día, uno o más tramos con inicio y fin en la hora
// local del huso del profesor. Presentación pura: el estado y el guardado son de `SeccionGrilla`. Las horas se
// escriben como HH:MM en un campo de texto, porque un tramo puede terminar a las 24:00 (fin del día) y un campo
// `time` no lo admite. El error de cada tramo se asocia a sus dos campos con `aria-describedby`.
import { useId } from 'react';
import { Boton } from '../../../ui';
import { DIAS_SEMANA, MAX_TRAMOS_GRILLA, MENSAJES_CONFIGURACION, type DiaSemana } from '../logica';
import estilos from './EditorGrilla.module.css';

/** Un tramo en edición; `clave` es estable aunque cambie el orden o se quiten otros (key de React). */
export type TramoEditable = { clave: number; dia_semana: DiaSemana; desde: string; hasta: string };

export type EditorGrillaProps = {
  tramos: readonly TramoEditable[];
  /** Un texto por tramo, en el mismo orden que `tramos` (`validarGrilla().porTramo`), o null. */
  errores: readonly (string | null)[];
  deshabilitado?: boolean;
  onCambiar: (clave: number, campo: 'desde' | 'hasta', valor: string) => void;
  onAgregar: (dia: DiaSemana) => void;
  onQuitar: (clave: number) => void;
};

const HORA_ESCRITA = /^\d{2}:\d{2}$/;

function nombreTramo(t: TramoEditable, n: number): string {
  const desde = t.desde.trim();
  const hasta = t.hasta.trim();
  return HORA_ESCRITA.test(desde) && HORA_ESCRITA.test(hasta) ? `${desde}-${hasta}` : String(n);
}

export function EditorGrilla({ tramos, errores, deshabilitado = false, onCambiar, onAgregar, onQuitar }: EditorGrillaProps) {
  const idBase = useId();
  const lleno = tramos.length >= MAX_TRAMOS_GRILLA;

  return (
    <div className={estilos.grilla}>
      {DIAS_SEMANA.map((dia) => {
        const nombre = MENSAJES_CONFIGURACION.diaSemana[dia];
        const minuscula = nombre.toLowerCase();
        const delDia = tramos.flatMap((t, i) => (t.dia_semana === dia ? [{ t, i }] : []));
        return (
          <fieldset key={dia} className={estilos.dia} disabled={deshabilitado}>
            <legend>{nombre}</legend>
            {delDia.length === 0 ? (
              <p className={estilos.vacio}>Sin tramos: este día no ofrecés horarios.</p>
            ) : (
              <ul className={estilos.tramos}>
                {delDia.map(({ t, i }, pos) => {
                  const n = pos + 1;
                  const error = errores[i] ?? null;
                  const idDesde = `${idBase}-${t.clave}-desde`;
                  const idHasta = `${idBase}-${t.clave}-hasta`;
                  const idError = `${idBase}-${t.clave}-error`;
                  const hayError = error !== null;
                  return (
                    <li key={t.clave} className={estilos.tramo}>
                      <div className={estilos.horas}>
                        <div className={estilos.campo}>
                          <label htmlFor={idDesde} className={estilos.etiqueta}>
                            Inicio{' '}
                            <span className={estilos.soloLectores}>
                              del tramo {n} del {minuscula}
                            </span>
                          </label>
                          <input
                            id={idDesde}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={5}
                            placeholder="08:00"
                            className={`${estilos.entrada} ${hayError ? estilos.conError : ''}`}
                            value={t.desde}
                            aria-invalid={hayError || undefined}
                            aria-describedby={hayError ? idError : undefined}
                            onChange={(e) => onCambiar(t.clave, 'desde', e.target.value)}
                          />
                        </div>
                        <div className={estilos.campo}>
                          <label htmlFor={idHasta} className={estilos.etiqueta}>
                            Fin{' '}
                            <span className={estilos.soloLectores}>
                              del tramo {n} del {minuscula}
                            </span>
                          </label>
                          <input
                            id={idHasta}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={5}
                            placeholder="13:00"
                            className={`${estilos.entrada} ${hayError ? estilos.conError : ''}`}
                            value={t.hasta}
                            aria-invalid={hayError || undefined}
                            aria-describedby={hayError ? idError : undefined}
                            onChange={(e) => onCambiar(t.clave, 'hasta', e.target.value)}
                          />
                        </div>
                        <Boton
                          variante="secundario"
                          aria-label={`Quitar tramo ${nombreTramo(t, n)} del ${minuscula}`}
                          onClick={() => onQuitar(t.clave)}
                        >
                          Quitar
                        </Boton>
                      </div>
                      {hayError ? (
                        <p id={idError} className={estilos.error}>
                          {error}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <div>
              <Boton
                variante="secundario"
                deshabilitado={lleno}
                aria-label={`Agregar tramo del ${minuscula}`}
                onClick={() => onAgregar(dia)}
              >
                Agregar tramo
              </Boton>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
