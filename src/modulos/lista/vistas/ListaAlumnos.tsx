// Lista de alumnos del profesor (WEB-07, ALU-09, CA-07; flujos-profesor.md F-13; componentes-profesor.md C-67).
// Tabla en escritorio y tarjetas en pantallas angostas, con estado (texto + ícono), ficha completa y edad.
// Nombres, mails y motivos se muestran siempre como texto (SEC-16).
import { Boton, Insignia, Vacio } from '../../../ui';
import type { AlumnoLista } from '../logica';
import { formatearNacimiento, INSIGNIA_ESTADO, nombreVisible, textoEdad, textoOpcional } from './formato';
import estilos from './ListaAlumnos.module.css';

export type ListaAlumnosProps = {
  alumnos: readonly AlumnoLista[];
  /** Alumno con una operación en curso: su botón queda `aria-busy`. */
  ocupadoId?: string | null;
  onAgregar: () => void;
  onEditar: (alumno: AlumnoLista) => void;
  /** Aprobar una cuenta rechazada (`aprobar_cuenta` acepta pendiente o rechazada). */
  onAprobar: (alumno: AlumnoLista) => void;
  /** Revisar si una cuenta aprobada tiene un alumno sin cuenta para unir (ALU-04). */
  onRevisarUnion: (alumno: AlumnoLista) => void;
};

const ID_TITULO = 'lista-alumnos-titulo';

function Acciones({
  alumno,
  ocupadoId,
  onEditar,
  onAprobar,
  onRevisarUnion,
}: { alumno: AlumnoLista } & Pick<ListaAlumnosProps, 'ocupadoId' | 'onEditar' | 'onAprobar' | 'onRevisarUnion'>) {
  const nombre = nombreVisible(alumno.nombre);
  const ocupado = ocupadoId === alumno.id;
  return (
    <div className={estilos.acciones}>
      <Boton variante="secundario" aria-label={`Editar a ${nombre}`} onClick={() => onEditar(alumno)}>
        Editar
      </Boton>
      {alumno.estado === 'rechazado' ? (
        <Boton
          aria-label={`Aprobar cuenta de ${nombre}`}
          cargando={ocupado}
          textoCargando="Aprobando…"
          onClick={() => onAprobar(alumno)}
        >
          Aprobar
        </Boton>
      ) : null}
      {alumno.estado === 'aprobado' && alumno.con_usuario ? (
        <Boton
          variante="secundario"
          aria-label={`Revisar unión de ${nombre}`}
          cargando={ocupado}
          textoCargando="Buscando…"
          onClick={() => onRevisarUnion(alumno)}
        >
          Revisar unión
        </Boton>
      ) : null}
    </div>
  );
}

export function ListaAlumnos({ alumnos, ocupadoId = null, onAgregar, onEditar, onAprobar, onRevisarUnion }: ListaAlumnosProps) {
  return (
    <section aria-labelledby={ID_TITULO} className={estilos.seccion}>
      <div className={estilos.cabecera}>
        <h2 id={ID_TITULO} className={estilos.titulo}>
          Alumnos
        </h2>
        <Boton onClick={onAgregar}>Agregar alumno</Boton>
      </div>
      {alumnos.length === 0 ? (
        <Vacio
          nivel={3}
          titulo="Todavía no hay alumnos"
          texto="Agregá un alumno con su mail para que ingrese, o sin mail para llevar su registro."
        />
      ) : (
        <table className={estilos.tabla}>
          <caption className={estilos.leyenda}>Alumnos con su estado, ficha y edad</caption>
          <thead className={estilos.encabezado}>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Estado</th>
              <th scope="col">Edad</th>
              <th scope="col">Teléfono</th>
              <th scope="col">Mail</th>
              <th scope="col">Nacimiento</th>
              <th scope="col">Cómo llegó</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alumnos.map((alumno) => {
              const insignia = INSIGNIA_ESTADO[alumno.estado];
              return (
                <tr key={alumno.id} className={estilos.fila}>
                  <th scope="row" className={estilos.celda} data-etiqueta="Nombre">
                    {nombreVisible(alumno.nombre)}
                    {alumno.estado === 'rechazado' && alumno.motivo_estado ? (
                      <span className={estilos.detalle}>Motivo del rechazo: {alumno.motivo_estado}</span>
                    ) : null}
                  </th>
                  <td className={estilos.celda} data-etiqueta="Estado">
                    <Insignia tipo={insignia.tipo} texto={insignia.texto} />
                  </td>
                  <td className={estilos.celda} data-etiqueta="Edad">
                    {textoEdad(alumno.edad)}
                  </td>
                  <td className={estilos.celda} data-etiqueta="Teléfono">
                    {textoOpcional(alumno.telefono)}
                  </td>
                  <td className={estilos.celda} data-etiqueta="Mail">
                    {textoOpcional(alumno.mail)}
                  </td>
                  <td className={estilos.celda} data-etiqueta="Nacimiento">
                    {formatearNacimiento(alumno.fecha_nacimiento)}
                  </td>
                  <td className={estilos.celda} data-etiqueta="Cómo llegó">
                    {textoOpcional(alumno.como_llego)}
                  </td>
                  <td className={estilos.celda} data-etiqueta="Acciones">
                    <Acciones
                      alumno={alumno}
                      ocupadoId={ocupadoId}
                      onEditar={onEditar}
                      onAprobar={onAprobar}
                      onRevisarUnion={onRevisarUnion}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
