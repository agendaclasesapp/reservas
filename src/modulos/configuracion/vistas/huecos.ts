// Vista previa de huecos por día de la grilla (WEB-08, AGE-01, AGE-02, CA-11): los huecos salen seguidos desde el
// inicio de cada tramo y un resto menor que la duración no genera hueco. Es solo una cuenta para mostrar; la base
// genera los huecos reales. Un tramo inválido o solapado no cuenta.
import { MENSAJES_CONFIGURACION, validarGrilla, type DiaSemana, type TramoGrilla } from '../logica';

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Cantidad de huecos de cada día con esa duración en minutos. Duración no válida (<= 0): cero huecos. */
export function huecosPorDia(tramos: readonly TramoGrilla[], duracionMin: number): Record<DiaSemana, number> {
  const cuenta: Record<DiaSemana, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  if (!Number.isInteger(duracionMin) || duracionMin <= 0) return cuenta;
  const { porTramo } = validarGrilla(tramos);
  tramos.forEach((t, i) => {
    if (porTramo[i] !== null) return;
    cuenta[t.dia_semana] += Math.floor((minutos(t.hasta) - minutos(t.desde)) / duracionMin);
  });
  return cuenta;
}

/** «Lunes: 9 huecos», «Martes: 1 hueco», «Domingo: sin huecos». */
export function textoHuecos(dia: DiaSemana, cantidad: number): string {
  const nombre = MENSAJES_CONFIGURACION.diaSemana[dia];
  if (cantidad === 0) return `${nombre}: sin huecos`;
  return `${nombre}: ${cantidad === 1 ? '1 hueco' : `${cantidad} huecos`}`;
}
