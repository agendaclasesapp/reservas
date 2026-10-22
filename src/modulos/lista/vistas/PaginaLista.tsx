// Página `#/lista` (WEB-07): conecta `useAlumnos` y las operaciones de `logica/` con `VistaLista`.
// El acceso solo del profesor lo decide la guarda de ruta; la base devuelve cero filas a quien no lo es.
import { useMemo } from 'react';
import { hoyEn } from '../../../lib/fechas';
import { useConfigPublica } from '../../agenda/logica';
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
  const configuracion = useConfigPublica();
  const zona = configuracion.config?.zona_horaria ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hoy = useMemo(() => hoyEn(zona), [zona]);
  return <VistaLista datos={datos} hoy={hoy} onRecargar={recargar} acciones={ACCIONES} />;
}
