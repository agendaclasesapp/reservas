// Página `#/admin` (WEB-10): conecta los hooks de `logica/` con `VistaAdmin`. El acceso solo del Administrador lo
// decide la guarda de ruta; la base devuelve 403 a quien no lo es (SEC-06).
import { copiarTexto } from '../../configuracion/logica';
import { useAltaProfesor, useCambiarEstadoProfesor, useProfesores } from '../logica';
import { VistaAdmin } from './VistaAdmin';

export function PaginaAdmin() {
  const { datos, recargar } = useProfesores();
  const alta = useAltaProfesor();
  const estado = useCambiarEstadoProfesor();
  return (
    <VistaAdmin
      datos={datos}
      onRecargar={recargar}
      alta={{ enviar: alta.enviar, enviando: alta.enviando }}
      estado={{ cambiar: estado.cambiar, cambiando: estado.cambiando }}
      copiar={copiarTexto}
    />
  );
}
