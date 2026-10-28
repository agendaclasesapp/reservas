// Página `#/configuracion` (WEB-08; B01 vacía, B03 «Mails fallidos», B14 enlace propio, B10 grilla, duración,
// anticipación y huso). rutas.tsx importa este archivo (default export). Arriba el enlace propio (F-17), después la
// configuración de la agenda (F-14) y al final los mails fallidos.
import { Cargando, ErrorCarga } from '../../../ui';
import { useConfiguracionAgenda, useEnlacePropio, useHusoDelProfesor } from '../logica';
import { EnlacePropio } from './EnlacePropio';
import { SeccionMailsFallidos } from './SeccionMailsFallidos';
import { VistaConfiguracionAgenda } from './VistaConfiguracionAgenda';

export default function Pagina() {
  const propio = useEnlacePropio();
  // El huso sale del profesor de la sesión (también inactivo, PRF-08).
  const huso = useHusoDelProfesor();
  const agenda = useConfiguracionAgenda();
  // Tras cambiar el huso, los mails fallidos se muestran ya en el nuevo (AGE-08), sin esperar a que se vuelva a montar.
  const zonaVigente = agenda.lectura.datos?.config.zona_horaria;
  return (
    <>
      <h1>Configuración</h1>
      {propio ? <EnlacePropio enlace={propio.enlace} activo={propio.activo} /> : null}
      <VistaConfiguracionAgenda
        lectura={agenda.lectura}
        onRecargar={agenda.recargar}
        onGuardarConfiguracion={agenda.guardarConfiguracion}
        onGuardarGrilla={agenda.guardarGrilla}
      />
      {huso.estado === 'listo' ? (
        <SeccionMailsFallidos zona={zonaVigente ?? huso.zona} />
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
