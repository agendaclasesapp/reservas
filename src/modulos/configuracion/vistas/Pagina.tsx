// Página `#/configuracion` (B01 vacía; B03 monta «Mails fallidos», WEB-08; B14 suma el enlace propio con un botón
// para copiarlo). B10 la completa con grilla, duración, anticipación y huso. rutas.tsx importa este archivo
// (default export).
import { Cargando, ErrorCarga } from '../../../ui';
import { useEnlacePropio, useHusoDelProfesor } from '../logica';
import { EnlacePropio } from './EnlacePropio';
import { SeccionMailsFallidos } from './SeccionMailsFallidos';

export default function Pagina() {
  const propio = useEnlacePropio();
  // El huso sale del profesor de la sesión (también inactivo, PRF-08).
  const huso = useHusoDelProfesor();
  return (
    <>
      <h1>Configuración</h1>
      {propio ? <EnlacePropio enlace={propio.enlace} activo={propio.activo} /> : null}
      {huso.estado === 'listo' ? (
        <SeccionMailsFallidos zona={huso.zona} />
      ) : huso.estado === 'error' ? (
        <ErrorCarga
          mensaje={`No se pudo cargar la configuración. ${huso.mensaje}`.trim()}
          onReintentar={huso.recargar}
        />
      ) : (
        <Cargando etiqueta="Cargando la configuración…" renglones={3} />
      )}
    </>
  );
}
