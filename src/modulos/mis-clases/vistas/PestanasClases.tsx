// Pestañas Próximas / Pasadas de Mis clases (WEB-05, flujos.md F-06): React Aria con un `TabPanel` por pestaña.
// `src/ui/Pestanas` usa un único `TabPanel` cuyo `id` cambia con la pestaña activa y, al cambiarla, el panel
// conserva el `id` anterior mientras la pestaña activa apunta con `aria-controls` a uno que no existe (axe:
// aria-valid-attr-value, crítico). Hasta que se corrija ahí (ver handoff), esta vista arma las suyas con los
// mismos estilos y el mismo comportamiento de teclado: flechas, Inicio y Fin, activación automática.
import type { ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import estilos from '../../../ui/Pestanas.module.css';

export type PestanaClases = { id: string; etiqueta: string; contenido: ReactNode };

export type PestanasClasesProps = {
  pestanas: ReadonlyArray<PestanaClases>;
  /** `id` de la pestaña activa. */
  activa: string;
  onCambio: (id: string) => void;
  /** Nombre accesible de la lista de pestañas. */
  etiqueta: string;
};

export function PestanasClases({ pestanas, activa, onCambio, etiqueta }: PestanasClasesProps) {
  return (
    <Tabs selectedKey={activa} onSelectionChange={(clave) => onCambio(String(clave))} className={estilos.pestanas}>
      <TabList aria-label={etiqueta} className={estilos.lista}>
        {pestanas.map((p) => (
          <Tab key={p.id} id={p.id} className={estilos.pestana}>
            {p.etiqueta}
          </Tab>
        ))}
      </TabList>
      {pestanas.map((p) => (
        <TabPanel key={p.id} id={p.id} className={estilos.panel}>
          {p.contenido}
        </TabPanel>
      ))}
    </Tabs>
  );
}
