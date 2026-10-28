// C-43 FechasSalteadas (RES-05, CA-19, WEB-04): antes de enviar una serie, qué fechas se saltean porque ya están
// ocupadas o bloqueadas. La primera fecha es la del hueco que se tocó: si ya no está libre, se avisa y no se envía.
import { Alerta, Cargando } from '../../../ui';
import { MENSAJES } from '../../../lib/errores';
import type { FechaSerie } from '../logica';
import { textoFecha, textoHora } from './formato';
import estilos from './FechasSalteadas.module.css';

/** Estado de la vista previa de la serie como unión discriminada (no varios booleanos). */
export type VistaFechas =
  | { estado: 'inactiva' }
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; fechas: readonly FechaSerie[] };

/** La primera fecha de la vista previa es el hueco tocado: `true` si alguien lo ocupó mientras tanto. */
export function primeraFechaNoLibre(vista: VistaFechas): boolean {
  return vista.estado === 'listo' && vista.fechas[0]?.estado === 'salteada';
}

/** Las fechas que se saltean, sin la primera (que se avisa aparte). */
export function fechasSalteadas(fechas: readonly FechaSerie[]): FechaSerie[] {
  return fechas.slice(1).filter((f) => f.estado === 'salteada');
}

export type FechasSalteadasProps = {
  vista: VistaFechas;
  /** Huso IANA del profesor. */
  zona: string;
};

function Contenido({ vista, zona }: FechasSalteadasProps) {
  switch (vista.estado) {
    case 'inactiva':
      return null;
    case 'cargando':
      return <Cargando etiqueta="Calculando las fechas que se saltean…" renglones={2} />;
    case 'error':
      return (
        <Alerta tipo="error" titulo="No pudimos calcular las fechas">
          {vista.mensaje} Elegí de nuevo el tipo de clase para volver a intentarlo.
        </Alerta>
      );
    case 'listo': {
      if (primeraFechaNoLibre(vista)) {
        return (
          <Alerta tipo="aviso" titulo="Ese horario ya no está libre">
            {MENSAJES.HUECO_NO_LIBRE}
          </Alerta>
        );
      }
      const referencia = vista.fechas[0]?.inicio;
      const salteadas = fechasSalteadas(vista.fechas);
      if (salteadas.length === 0) return <p className={estilos.texto}>No se saltea ninguna fecha.</p>;
      return (
        <div>
          <p className={estilos.texto}>
            {salteadas.length === 1 ? 'Se saltea esta fecha' : 'Se saltean estas fechas'} porque no{' '}
            {salteadas.length === 1 ? 'está libre' : 'están libres'}:
          </p>
          <ul className={estilos.lista} aria-label="Fechas que se saltean">
            {salteadas.map((f) => (
              <li key={f.inicio} className={estilos.item}>
                {textoFecha(f.inicio, zona, referencia)}, {textoHora(f.inicio, zona)}{' '}
                <span className={estilos.motivo}>({f.motivo === 'bloqueado' ? 'bloqueada' : 'ocupada'})</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }
}

/** Región siempre montada (`aria-live`) para que el resultado se anuncie al cambiar el tipo de clase. */
export function FechasSalteadas({ vista, zona }: FechasSalteadasProps) {
  return (
    <div aria-live="polite" className={estilos.fechas}>
      <Contenido vista={vista} zona={zona} />
    </div>
  );
}
