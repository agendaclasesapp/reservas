// CC-10 · Leyenda (CAL-17, CA-82; A11Y-41): Confirmada, Pendiente, Bloqueado y Libre, cada una con su muestra (la misma
// clase CSS que el bloque) y su texto. La muestra es decorativa (`aria-hidden`): el estado se dice con el texto.
import { TEXTOS_CALENDARIO } from './formato';
import estilosBloque from './BloqueClase.module.css';
import estilosBloqueo from './BloqueBloqueo.module.css';
import estilosHueco from './HuecoLibre.module.css';
import estilos from './Calendario.module.css';

const ESTADOS = [
  { texto: TEXTOS_CALENDARIO.confirmada, clase: estilosBloque.confirmada },
  { texto: TEXTOS_CALENDARIO.pendiente, clase: estilosBloque.pendiente },
  { texto: TEXTOS_CALENDARIO.bloqueado, clase: estilosBloqueo.bloqueado },
  { texto: TEXTOS_CALENDARIO.libre, clase: estilosHueco.libre },
] as const;

export function LeyendaCalendario() {
  return (
    <ul aria-label={TEXTOS_CALENDARIO.leyenda} className={estilos.leyenda}>
      {ESTADOS.map(({ texto, clase }) => (
        <li key={texto} className={estilos.leyendaItem}>
          <span aria-hidden="true" className={`${estilos.muestra} ${clase}`} />
          {texto}
        </li>
      ))}
    </ul>
  );
}
