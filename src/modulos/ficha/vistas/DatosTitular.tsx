// Datos del titular de la cuenta, solo lectura (WEB-03, ALU-02): nombre, mail, teléfono y fecha de nacimiento.
// «Cómo llegaste» no es de la persona: va en el vínculo con cada profesor (ALU-14).
import type { MiFicha } from '../logica';
import { formatearNacimiento } from './formato';
import estilos from './DatosTitular.module.css';

export type DatosTitularProps = { ficha: MiFicha };

function texto(valor: string | null): string {
  return valor === null || valor.trim() === '' ? 'Sin dato' : valor;
}

export function DatosTitular({ ficha }: DatosTitularProps) {
  return (
    <section className={estilos.datos} aria-labelledby="ficha-datos-titulo">
      <h2 id="ficha-datos-titulo">Tus datos</h2>
      <dl className={estilos.lista}>
        <div>
          <dt>Nombre</dt>
          <dd>{texto(ficha.nombre)}</dd>
        </div>
        <div>
          <dt>Mail</dt>
          <dd>{texto(ficha.mail)}</dd>
        </div>
        <div>
          <dt>Teléfono o WhatsApp</dt>
          <dd>{texto(ficha.telefono)}</dd>
        </div>
        <div>
          <dt>Fecha de nacimiento</dt>
          <dd>{formatearNacimiento(ficha.fecha_nacimiento)}</dd>
        </div>
      </dl>
    </section>
  );
}
