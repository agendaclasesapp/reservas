// Página `#/` (WEB-09, ADR-020): sin enlace de profesor muestra solo «Pedile el enlace a tu profesor» y el
// acceso al ingreso; no lista profesores ni muestra agenda. Quien ya tiene un vínculo llega redirigido a la
// agenda de ese profesor; con más de uno, el selector de WEB-11 (que monta el layout, arriba). La decisión
// está en ../logica (useInicio); este archivo solo la presenta. rutas.tsx lo importa (default, sin props).
import { Navigate } from 'react-router';
import { Cargando } from '../../../ui';
import { MENSAJE_INICIO, useInicio } from '../logica';
import estilos from './Pagina.module.css';

export const TEXTO_ELEGIR_PROFESOR = 'Elegí arriba con qué profesor querés trabajar.';

export default function Pagina() {
  const inicio = useInicio();
  switch (inicio.tipo) {
    case 'redirigir':
      return <Navigate to={inicio.a} replace />;
    case 'cargando':
      return (
        <div className={estilos.inicio}>
          <h1>Inicio</h1>
          <Cargando etiqueta="Cargando…" renglones={2} />
        </div>
      );
    case 'selector':
      return (
        <div className={estilos.inicio}>
          <h1>Tus profesores</h1>
          <p className={estilos.texto}>{TEXTO_ELEGIR_PROFESOR}</p>
        </div>
      );
    case 'mensaje':
      return (
        <div className={estilos.inicio}>
          <h1>{MENSAJE_INICIO}</h1>
          {inicio.conIngreso ? (
            <p>
              <a href="#/ingreso" className={estilos.accion}>
                Ingresar
              </a>
            </p>
          ) : null}
        </div>
      );
  }
}
