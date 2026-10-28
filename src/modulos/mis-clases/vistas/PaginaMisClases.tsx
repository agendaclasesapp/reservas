// Página `#/mis-clases` (WEB-05, RES-06): conecta `useSesion()`, `useMisClases()` y `useCambioDeClase()` (B08) con `VistaMisClases`.
import { refrescarSesion, useSesion } from '../../../estado';
import { useCambioDeClase, useMisClases } from '../logica';
import { VistaMisClases } from './VistaMisClases';

export function PaginaMisClases() {
  const estado = useSesion();
  const { datos, recargar } = useMisClases();
  const cambio = useCambioDeClase();
  return (
    <VistaMisClases
      estado={estado}
      datos={datos}
      onRecargar={recargar}
      onReintentarSesion={() => void refrescarSesion()}
      cambio={cambio}
    />
  );
}
