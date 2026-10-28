// Página `#/lista` (WEB-07): conecta `useAlumnos` y las operaciones de `logica/` con `VistaLista`.
// El acceso solo del profesor lo decide la guarda de ruta; la base devuelve cero filas a quien no lo es.
import { useMemo } from 'react';
import { useSesion } from '../../../estado';
import { hoyEn } from '../../../lib/fechas';
import { useHusoDelProfesor } from '../../configuracion/logica';
import {
  altaAlumno,
  aprobarCuenta,
  descartarUnion,
  editarAlumno,
  rechazarCuenta,
  sugerenciasUnion,
  unirAlumnos,
  useAlumnos,
} from '../logica';
import { VistaLista, type AccionesLista } from './VistaLista';

const ACCIONES: AccionesLista = {
  aprobar: (id, motivo) => aprobarCuenta(id, motivo),
  rechazar: (id, motivo) => rechazarCuenta(id, motivo),
  sugerencias: (id) => sugerenciasUnion(id),
  unir: (cuentaId, sinCuentaId) => unirAlumnos(cuentaId, sinCuentaId),
  descartar: (cuentaId, sinCuentaId) => descartarUnion(cuentaId, sinCuentaId),
  alta: (datos) => altaAlumno(datos),
  editar: (id, datos) => editarAlumno(id, datos),
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
  return <VistaLista datos={datos} hoy={hoy} onRecargar={recargar} profesorActivo={profesorActivo} acciones={ACCIONES} />;
}
