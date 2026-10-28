// Página `#/lista` (WEB-07): conecta `useAlumnos` y las operaciones de `logica/` con `VistaLista`.
// El acceso solo del profesor lo decide la guarda de ruta; la base devuelve cero filas a quien no lo es.
import { useMemo, useState } from 'react';
import { useSesion } from '../../../estado';
import { hoyEn } from '../../../lib/fechas';
import { useHusoDelProfesor } from '../../configuracion/logica';
import {
  altaAlumno,
  aprobarCuenta,
  borrarAlumno,
  descartarUnion,
  editarAlumno,
  rechazarCuenta,
  responderSolicitud,
  sugerenciasUnion,
  unirAlumnos,
  useAlumnos,
  useClases,
  useSolicitudesPendientes,
  type FiltroClases,
} from '../logica';
import { SeccionClases } from './SeccionClases';
import { SolicitudesPendientes } from './SolicitudesPendientes';
import { VistaLista, type AccionesLista } from './VistaLista';

const ACCIONES: AccionesLista = {
  aprobar: (id, motivo) => aprobarCuenta(id, motivo),
  rechazar: (id, motivo) => rechazarCuenta(id, motivo),
  sugerencias: (id) => sugerenciasUnion(id),
  unir: (cuentaId, sinCuentaId) => unirAlumnos(cuentaId, sinCuentaId),
  descartar: (cuentaId, sinCuentaId) => descartarUnion(cuentaId, sinCuentaId),
  alta: (datos) => altaAlumno(datos),
  editar: (id, datos) => editarAlumno(id, datos),
  borrar: (id) => borrarAlumno(id),
};

export function PaginaLista() {
  const { datos, recargar } = useAlumnos();
  // PRF-08: con el profesor inactivo la lista sigue disponible, pero no aprueba accesos ni da de alta.
  const sesion = useSesion();
  const profesorActivo = sesion.tipo === 'sesion' ? (sesion.sesion.profesor?.activo ?? true) : true;
  // B14 (T14.3): el huso sale del profesor de la sesión (también inactivo, PRF-08).
  const huso = useHusoDelProfesor();
  const zona = huso.estado === 'listo' ? huso.zona : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hoy = useMemo(() => hoyEn(zona), [zona]);
  // B07 (T07.2): solicitudes pendientes y clases filtrables (WEB-07, PRF-06, CA-29), en el huso del profesor.
  const solicitudes = useSolicitudesPendientes();
  const [filtro, setFiltro] = useState<FiltroClases>({});
  const clases = useClases(filtro, zona);
  const secciones = (
    <>
      <SolicitudesPendientes
        datos={solicitudes.datos}
        zona={zona}
        profesorActivo={profesorActivo}
        onResponder={(id, decision, motivo) => responderSolicitud(id, decision, motivo)}
        onRecargar={() => {
          solicitudes.recargar();
          clases.recargar();
        }}
      />
      <SeccionClases
        datos={clases.datos}
        filtro={filtro}
        alumnos={datos.alumnos}
        zona={zona}
        onFiltro={setFiltro}
        onRecargar={clases.recargar}
      />
    </>
  );
  return (
    <VistaLista
      datos={datos}
      hoy={hoy}
      onRecargar={recargar}
      profesorActivo={profesorActivo}
      acciones={ACCIONES}
      secciones={secciones}
    />
  );
}
