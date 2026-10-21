import type { ReactNode } from 'react';
import { Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Boton } from './Boton';
import estilos from './Dialogo.module.css';

export type DialogoProps = {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  /** Botones de acción (el padre los construye con `Boton`). */
  acciones?: ReactNode;
  /** Texto del botón de cierre. Por defecto "Cerrar". */
  textoCerrar?: string;
};

/**
 * Diálogo modal de React Aria (ADR-010): trampa de foco, Esc cierra, devuelve el foco al disparador
 * y el título nombra al diálogo (aria-labelledby). Pantalla casi completa en 360 px.
 */
export function Dialogo({ abierto, titulo, onCerrar, children, acciones, textoCerrar = 'Cerrar' }: DialogoProps) {
  return (
    <ModalOverlay
      isOpen={abierto}
      onOpenChange={(abre) => {
        if (!abre) onCerrar();
      }}
      isDismissable
      className={estilos.velo}
    >
      <Modal className={estilos.modal}>
        <Dialog className={estilos.dialogo}>
          <Heading slot="title" className={estilos.titulo}>
            {titulo}
          </Heading>
          <div className={estilos.cuerpo}>{children}</div>
          <div className={estilos.acciones}>
            {acciones}
            <Boton variante="secundario" onClick={onCerrar}>
              {textoCerrar}
            </Boton>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
