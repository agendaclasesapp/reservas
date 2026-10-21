import type { ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import estilos from './Pestanas.module.css';

export type Pestana = { id: string; etiqueta: string };

export type PestanasProps = {
  pestanas: ReadonlyArray<Pestana>;
  /** `id` de la pestaña activa. */
  activa: string;
  onCambio: (id: string) => void;
  /** Nombre accesible de la lista de pestañas, p. ej. "Mis clases". */
  etiqueta?: string;
  /** Contenido de la pestaña activa: el padre elige qué mostrar según `activa`. */
  children?: ReactNode;
};

/**
 * Pestañas de React Aria (ADR-010): `role=tablist`, flechas izquierda/derecha, Inicio y Fin cambian la activa
 * (activación automática) y el panel queda enlazado con su pestaña (A11Y-02, A11Y-18).
 */
export function Pestanas({ pestanas, activa, onCambio, etiqueta, children }: PestanasProps) {
  return (
    <Tabs selectedKey={activa} onSelectionChange={(clave) => onCambio(String(clave))} className={estilos.pestanas}>
      <TabList aria-label={etiqueta} className={estilos.lista}>
        {pestanas.map((pestana) => (
          <Tab key={pestana.id} id={pestana.id} className={estilos.pestana}>
            {pestana.etiqueta}
          </Tab>
        ))}
      </TabList>
      <TabPanel id={activa} className={estilos.panel}>
        {children}
      </TabPanel>
    </Tabs>
  );
}
