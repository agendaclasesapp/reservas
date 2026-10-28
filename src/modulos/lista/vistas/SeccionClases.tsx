// Sección «Clases» de `#/lista` (WEB-07, PRF-06, CA-29, SEC-16; flujos-profesor.md F-12): las clases de la agenda del
// profesor, pasadas incluidas, filtrables por «Desde», «Hasta» (días en el huso del profesor) y «Alumno». El
// filtro se aplica al cambiar un campo; una región `aria-live` anuncia el total («12 clases»). Con «Hasta» anterior
// a «Desde» el error queda asociado al campo y no se consulta. Vacío: «No hay clases con estos filtros» + «Limpiar
// filtros». El filtro lo guarda la página (lo necesita `useClases`): esta sección es controlada.
import { useId } from 'react';
import { formatearFecha, formatearHora } from '../../../lib/fechas';
import { Boton, CampoFecha, Cargando, ErrorCarga, Insignia, Vacio, type TipoInsignia } from '../../../ui';
import {
  MENSAJES_RESPUESTA,
  nombreVisible,
  textoEstadoClaseProfesor,
  validarFiltroClases,
  type ClaseProfesor,
  type EstadoLectura,
  type FiltroClases,
} from '../logica';
import estilos from './SeccionClases.module.css';

export type AlumnoFiltro = { id: string; nombre: string | null };

export type SeccionClasesProps = {
  datos: EstadoLectura<ClaseProfesor>;
  filtro: FiltroClases;
  /** Alumnos del profesor para el selector «Alumno» (de `v_alumnos`). */
  alumnos: readonly AlumnoFiltro[];
  /** Huso del profesor: las fechas y las horas se muestran en él (ADR-004). */
  zona: string;
  onFiltro: (filtro: FiltroClases) => void;
  /** Vuelve a leer `v_clases` (botón «Reintentar»). */
  onRecargar: () => void;
};

const ID_TITULO = 'clases-titulo';

/** «12 clases», «1 clase»: el texto que anuncia la región `aria-live`. */
export function textoTotal(n: number): string {
  return n === 1 ? '1 clase' : `${n} clases`;
}

function insignia(clase: ClaseProfesor): TipoInsignia {
  if (clase.estado === 'pendiente') return clase.pasada ? 'pendienteSinRespuesta' : 'pendiente';
  if (clase.estado === 'confirmada') return 'confirmada';
  if (clase.estado === 'rechazada') return 'rechazada';
  return 'cancelada';
}

function textoSerie(clase: ClaseProfesor): string | null {
  if (clase.reserva_tipo !== 'serie') return null;
  return clase.frecuencia === 2 ? 'Serie quincenal' : 'Serie semanal';
}

function FilaClase({ clase, zona }: { clase: ClaseProfesor; zona: string }) {
  const serie = textoSerie(clase);
  const observacion = clase.observacion?.trim() ?? '';
  const solicitud = clase.solicitud_pendiente;
  const titular = nombreVisible(clase.titular);
  return (
    <li className={estilos.clase}>
      <p className={estilos.fecha}>
        {formatearFecha(clase.inicio, zona)}, de {formatearHora(clase.inicio, zona)} a {formatearHora(clase.fin, zona)}
      </p>
      <p className={estilos.alumno}>{titular}</p>
      {clase.quien_toma !== null && clase.quien_toma !== clase.titular ? (
        <p className={estilos.detalle}>Toma la clase: {clase.quien_toma}</p>
      ) : null}
      <p>
        <Insignia tipo={insignia(clase)} texto={textoEstadoClaseProfesor(clase)} />
      </p>
      {solicitud !== null && !solicitud.vencida ? (
        <p className={estilos.aviso}>Solicitud pendiente: {MENSAJES_RESPUESTA.tipo[solicitud.tipo]}</p>
      ) : null}
      {serie !== null ? <p className={estilos.detalle}>{serie}</p> : null}
      {observacion !== '' ? <p className={estilos.observacion}>{observacion}</p> : null}
    </li>
  );
}

export function SeccionClases({ datos, filtro, alumnos, zona, onFiltro, onRecargar }: SeccionClasesProps) {
  const idAlumno = useId();
  const errorRango = validarFiltroClases(filtro);
  const hayFiltro = Boolean(filtro.desde) || Boolean(filtro.hasta) || Boolean(filtro.alumnoId);
  const primeraCarga = datos.estado === 'cargando' && datos.filas.length === 0;
  const listo = datos.estado === 'listo' && errorRango === null;
  const falloDeCarga = datos.estado === 'error' && errorRango === null;
  const vacio = listo && datos.filas.length === 0;
  const verLista = errorRango === null && datos.estado !== 'error' && datos.filas.length > 0;
  const limpiar = () => onFiltro({ desde: null, hasta: null, alumnoId: null });

  return (
    <section aria-labelledby={ID_TITULO} className={estilos.seccion}>
      <h2 id={ID_TITULO} className={estilos.titulo}>
        Clases
      </h2>
      <form className={estilos.filtros} onSubmit={(e) => e.preventDefault()} noValidate aria-label="Filtros de clases">
        <CampoFecha
          etiqueta="Desde"
          valor={filtro.desde ?? ''}
          onCambio={(valor) => onFiltro({ ...filtro, desde: valor === '' ? null : valor })}
        />
        <CampoFecha
          etiqueta="Hasta"
          valor={filtro.hasta ?? ''}
          error={errorRango ?? undefined}
          onCambio={(valor) => onFiltro({ ...filtro, hasta: valor === '' ? null : valor })}
        />
        <div className={estilos.campo}>
          <label htmlFor={idAlumno} className={estilos.etiqueta}>
            Alumno
          </label>
          <select
            id={idAlumno}
            className={estilos.selector}
            value={filtro.alumnoId ?? ''}
            onChange={(e) => onFiltro({ ...filtro, alumnoId: e.target.value === '' ? null : e.target.value })}
          >
            <option value="">Todos los alumnos</option>
            {alumnos.map((a) => (
              <option key={a.id} value={a.id}>
                {nombreVisible(a.nombre)}
              </option>
            ))}
          </select>
        </div>
        {hayFiltro && !vacio ? (
          <div className={estilos.limpiar}>
            <Boton variante="secundario" onClick={limpiar}>
              Limpiar filtros
            </Boton>
          </div>
        ) : null}
      </form>
      <p role="status" aria-live="polite" aria-atomic="true" className={estilos.total}>
        {listo ? textoTotal(datos.filas.length) : ''}
      </p>
      {primeraCarga && errorRango === null ? <Cargando etiqueta="Cargando las clases…" renglones={3} /> : null}
      {falloDeCarga ? (
        <ErrorCarga mensaje={`No se pudieron cargar las clases. ${datos.error ?? ''}`.trim()} onReintentar={onRecargar} />
      ) : null}
      {vacio ? (
        hayFiltro ? (
          <Vacio
            nivel={3}
            titulo="No hay clases con estos filtros"
            accion={
              <Boton variante="secundario" onClick={limpiar}>
                Limpiar filtros
              </Boton>
            }
          />
        ) : (
          <Vacio nivel={3} titulo="Todavía no hay clases" />
        )
      ) : null}
      {verLista ? (
        <ul className={estilos.lista}>
          {datos.filas.map((c) => (
            <FilaClase key={c.id} clase={c} zona={zona} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
