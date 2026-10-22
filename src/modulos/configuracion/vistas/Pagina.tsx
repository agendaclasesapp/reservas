// Página `#/configuracion` (B01 vacía; B03 monta solo «Mails fallidos», WEB-08). B10 la completa con grilla,
// duración, anticipación y huso. rutas.tsx importa este archivo (default export).
import { Cargando, ErrorCarga } from '../../../ui';
import { useConfigPublica } from '../../agenda/logica';
import { SeccionMailsFallidos } from './SeccionMailsFallidos';

export default function Pagina() {
  const configuracion = useConfigPublica();
  return (
    <>
      <h1>Configuración</h1>
      {configuracion.estado === 'listo' && configuracion.config ? (
        <SeccionMailsFallidos zona={configuracion.config.zona_horaria} />
      ) : configuracion.estado === 'error' ? (
        <ErrorCarga
          mensaje={`No se pudo cargar la configuración. ${configuracion.error?.mensaje ?? ''}`.trim()}
          onReintentar={configuracion.recargar}
        />
      ) : (
        <Cargando etiqueta="Cargando la configuración…" renglones={3} />
      )}
    </>
  );
}
