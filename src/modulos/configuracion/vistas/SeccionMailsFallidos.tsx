// Sección «Mails fallidos» de Configuración (WEB-08, NFR-07, AVI-08, CA-34). Conecta `useMailsFallidos` con
// la presentación de TablaMailsFallidos. La página completa de Configuración es de B10.
import { useMailsFallidos, type LectorMailsFallidos } from '../logica';
import { TablaMailsFallidos, type VistaMailsFallidos } from './TablaMailsFallidos';
import estilos from './SeccionMailsFallidos.module.css';

export type SeccionMailsFallidosProps = {
  /** Huso del profesor (`config_publica().zona_horaria`). */
  zona: string;
  /** Solo para pruebas. */
  lector?: LectorMailsFallidos;
};

export function SeccionMailsFallidos({ zona, lector }: SeccionMailsFallidosProps) {
  const { datos, recargar } = useMailsFallidos(lector);
  const vista: VistaMailsFallidos =
    datos.estado === 'cargando'
      ? { estado: 'cargando' }
      : datos.estado === 'error'
        ? {
            estado: 'error',
            mensaje: `No se pudieron cargar los mails fallidos. ${datos.error}`.trim(),
            onReintentar: recargar,
          }
        : { estado: 'listo', mails: datos.mails };

  return (
    <section aria-labelledby="titulo-mails-fallidos" className={estilos.seccion}>
      <h2 id="titulo-mails-fallidos">Mails fallidos</h2>
      <p className={estilos.ayuda}>
        Mails que el sistema no pudo enviar, por ejemplo por un error del servidor de correo o por superar el tope
        de envío.
      </p>
      <TablaMailsFallidos vista={vista} zona={zona} />
    </section>
  );
}
