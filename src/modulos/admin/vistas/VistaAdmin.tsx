// Vista `#/admin` del Administrador (WEB-10, ADM-02, ADM-03, ADM-05, DEC-34, SEC-16): lista de profesores con su
// enlace (con botón para copiarlo) y estado, inactivar y reactivar con confirmación, y el alta.
// Recibe los datos y las acciones por props: la página los conecta con `logica/` y las pruebas con datos fijos.
// Nombres y mails son texto plano; el acceso solo del Administrador lo decide la guarda de ruta (la base da 403).
import { useState } from 'react';
import { Alerta, Boton, Cargando, Dialogo, ErrorCarga, Vacio } from '../../../ui';
import type {
  EstadoProfesores,
  ProfesorEntrada,
  ProfesorLista,
  ResultadoAltaProfesor,
  ResultadoEstadoProfesor,
} from '../logica';
import { AltaProfesorForm } from './AltaProfesorForm';
import { nombreProfesor, textoCantidad } from './formato';
import { TarjetaProfesor } from './TarjetaProfesor';
import estilos from './VistaAdmin.module.css';

export type VistaAdminProps = {
  /** `useProfesores().datos`. */
  datos: EstadoProfesores;
  /** `useProfesores().recargar`: se llama después de un alta o de un cambio de estado. */
  onRecargar: () => void;
  /** `useAltaProfesor`. */
  alta: { enviar: (datos: ProfesorEntrada) => Promise<ResultadoAltaProfesor>; enviando: boolean };
  /** `useCambiarEstadoProfesor`: `cambiando` es el id del profesor en curso. */
  estado: {
    cambiar: (profesorId: string, activo: boolean) => Promise<ResultadoEstadoProfesor>;
    cambiando: string | null;
  };
  /** `copiarTexto` de configuración: false si el navegador no dejó copiar. */
  copiar: (texto: string) => Promise<boolean>;
};

type Cambio = { profesor: ProfesorLista; activar: boolean };
type Aviso = { tipo: 'exito' | 'info' | 'error'; texto: string };

export const TEXTO_CAMBIO_FALLIDO = 'No se pudo cambiar el estado. Probá de nuevo.';

/** ADM-05: qué pasa al inactivar y al reactivar (la pausa no borra nada). */
export const TEXTO_INACTIVAR =
  'Es una pausa: no se borran clases ni datos. Se cancelan todas sus solicitudes pendientes y se mantienen las reservas ya confirmadas. Su enlace muestra que no toma reservas.';
export const TEXTO_REACTIVAR =
  'Todo queda como estaba, salvo las solicitudes canceladas, que no vuelven: sus alumnos tienen que pedir de nuevo.';

export function VistaAdmin({ datos, onRecargar, alta, estado, copiar }: VistaAdminProps) {
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [errorCambio, setErrorCambio] = useState('');
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [copia, setCopia] = useState('');

  const cerrarCambio = () => {
    if (estado.cambiando !== null) return;
    setCambio(null);
    setErrorCambio('');
  };

  const confirmar = async () => {
    if (!cambio || estado.cambiando !== null) return;
    setErrorCambio('');
    const resultado = await estado.cambiar(cambio.profesor.profesor_id, cambio.activar);
    if (!resultado.ok) {
      setErrorCambio(resultado.mensaje || TEXTO_CAMBIO_FALLIDO);
      return;
    }
    const nombre = nombreProfesor(cambio.profesor);
    setAviso({
      tipo: 'exito',
      texto: cambio.activar ? `${nombre} quedó activo.` : `${nombre} quedó inactivo.`,
    });
    setCambio(null);
    onRecargar();
  };

  const copiarEnlace = async (profesor: ProfesorLista) => {
    const nombre = nombreProfesor(profesor);
    const copiado = await copiar(profesor.enlace);
    setCopia(
      copiado
        ? `Enlace de ${nombre} copiado.`
        : `No se pudo copiar el enlace de ${nombre}. Seleccionalo y copialo a mano.`,
    );
  };

  const hayLista = datos.profesores.length > 0;
  const recargando = datos.estado === 'cargando' && hayLista;

  return (
    <>
      <h1>Administración</h1>
      <section aria-labelledby="admin-profesores" className={estilos.seccion}>
        <div className={estilos.cabecera}>
          <h2 id="admin-profesores" className={estilos.titulo}>
            Profesores
          </h2>
          {datos.estado !== 'cargando' || hayLista ? (
            <p className={estilos.cuenta}>{textoCantidad(datos.profesores.length)}</p>
          ) : null}
        </div>
        {aviso ? <Alerta tipo={aviso.tipo}>{aviso.texto}</Alerta> : null}
        {datos.estado === 'error' ? (
          <ErrorCarga
            mensaje={`No se pudo cargar la lista de profesores. ${datos.error ?? ''}`.trim()}
            onReintentar={onRecargar}
          />
        ) : null}
        {datos.estado === 'cargando' && !hayLista ? <Cargando etiqueta="Cargando los profesores…" renglones={3} /> : null}
        {datos.estado === 'listo' && !hayLista ? (
          <Vacio
            titulo="Todavía no hay profesores"
            texto="Dá de alta al primero con el formulario de más abajo."
            nivel={3}
          />
        ) : null}
        {hayLista ? (
          <ul className={estilos.lista} aria-busy={recargando || undefined}>
            {datos.profesores.map((profesor) => (
              <TarjetaProfesor
                key={profesor.profesor_id}
                profesor={profesor}
                ocupado={estado.cambiando !== null}
                onCopiar={(p) => void copiarEnlace(p)}
                onCambiarEstado={(p) => {
                  setAviso(null);
                  setErrorCambio('');
                  setCambio({ profesor: p, activar: !p.activo });
                }}
              />
            ))}
          </ul>
        ) : null}
        {/* Región siempre montada para que el resultado de copiar se anuncie sin mover el foco. */}
        <p role="status" className={estilos.copia}>
          {copia}
        </p>
      </section>

      <AltaProfesorForm onAlta={alta.enviar} enviando={alta.enviando} onAltaHecha={onRecargar} />

      {cambio ? (
        <Dialogo
          abierto
          titulo={`${cambio.activar ? 'Reactivar' : 'Inactivar'} a ${nombreProfesor(cambio.profesor)}`}
          onCerrar={cerrarCambio}
          textoCerrar="Cancelar"
          acciones={
            <Boton
              variante={cambio.activar ? 'primario' : 'peligro'}
              cargando={estado.cambiando !== null}
              textoCargando={cambio.activar ? 'Reactivando…' : 'Inactivando…'}
              onClick={() => void confirmar()}
            >
              {cambio.activar ? 'Reactivar' : 'Inactivar'}
            </Boton>
          }
        >
          <p className={estilos.confirmacion}>{cambio.activar ? TEXTO_REACTIVAR : TEXTO_INACTIVAR}</p>
          {errorCambio ? <Alerta tipo="error">{errorCambio}</Alerta> : null}
        </Dialogo>
      ) : null}
    </>
  );
}
