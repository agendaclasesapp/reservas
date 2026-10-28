// Configuración de la agenda del profesor (WEB-08, AGE-01..04, AGE-08, AGE-10, CA-11, CA-12, CA-16; F-14):
// grilla semanal, duración de clase, anticipación mínima y huso horario, cada uno con su botón de guardar.
// Presentación pura: recibe la lectura y las dos escrituras de `useConfiguracionAgenda` (`Pagina`
// las conecta). Estados: cargando, error al leer con «Reintentar», y listo (con un aviso si falló una recarga).
// El acceso solo del profesor lo decide la guarda de ruta; la base rechaza con 403 a quien no lo es.
import { useState } from 'react';
import { Alerta, Boton, Cargando, ErrorCarga } from '../../../ui';
import type {
  EntradaConfiguracion,
  EstadoConfiguracionAgenda,
  ResultadoConfiguracion,
  ResultadoGrilla,
  TramoGrilla,
} from '../logica';
import estilos from './Agenda.module.css';
import { SeccionGrilla } from './SeccionGrilla';
import { SeccionesAjustes } from './SeccionesAjustes';

export type VistaConfiguracionAgendaProps = {
  lectura: EstadoConfiguracionAgenda;
  onRecargar: () => void;
  onGuardarConfiguracion: (entrada: EntradaConfiguracion) => Promise<ResultadoConfiguracion>;
  onGuardarGrilla: (tramos: readonly TramoGrilla[]) => Promise<ResultadoGrilla>;
};

export const TEXTOS_CONFIGURACION = {
  cargando: 'Cargando la configuración de tu agenda…',
  errorLectura: 'No se pudo cargar la configuración de tu agenda.',
  errorRecarga: 'No se pudo actualizar la configuración. Lo que ves puede estar desactualizado.',
} as const;

/** Duración válida (entero de 1 en adelante) del texto que se escribe; si no, la guardada. */
function duracionParaPrevia(texto: string, guardada: number): number {
  const t = texto.trim();
  const n = /^\d+$/.test(t) ? Number(t) : Number.NaN;
  return Number.isInteger(n) && n > 0 ? n : guardada;
}

export function VistaConfiguracionAgenda({
  lectura,
  onRecargar,
  onGuardarConfiguracion,
  onGuardarGrilla,
}: VistaConfiguracionAgendaProps) {
  const datos = lectura.datos;
  const [duracionTexto, setDuracionTexto] = useState<string | null>(null);

  if (datos === null) {
    return lectura.estado === 'error' ? (
      <ErrorCarga mensaje={`${TEXTOS_CONFIGURACION.errorLectura} ${lectura.error ?? ''}`.trim()} onReintentar={onRecargar} />
    ) : (
      <Cargando etiqueta={TEXTOS_CONFIGURACION.cargando} renglones={5} />
    );
  }

  const texto = duracionTexto ?? String(datos.config.duracion_min);
  return (
    <div className={estilos.agenda}>
      {lectura.estado === 'error' ? (
        <Alerta
          tipo="aviso"
          accion={
            <Boton variante="secundario" onClick={onRecargar}>
              Reintentar
            </Boton>
          }
        >
          {`${TEXTOS_CONFIGURACION.errorRecarga} ${lectura.error ?? ''}`.trim()}
        </Alerta>
      ) : null}
      <SeccionGrilla
        grilla={datos.grilla}
        duracionMin={duracionParaPrevia(texto, datos.config.duracion_min)}
        zona={datos.config.zona_horaria}
        onGuardar={onGuardarGrilla}
      />
      <SeccionesAjustes
        config={datos.config}
        duracionTexto={texto}
        onDuracionTexto={setDuracionTexto}
        onGuardar={onGuardarConfiguracion}
      />
    </div>
  );
}
