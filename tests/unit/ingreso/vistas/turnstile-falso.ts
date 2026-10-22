// Turnstile falso para las pruebas de la pantalla de ingreso: guarda las opciones con que se creó el widget
// para poder resolver o vencer el desafío desde la prueba (WEB-02, CA-44).
import { act } from '@testing-library/react';
import { vi } from 'vitest';
import type { ApiTurnstile, CargadorTurnstile, OpcionesTurnstile } from '../../../../src/modulos/ingreso/vistas/DesafioTurnstile';

export type TurnstileFalso = {
  api: ApiTurnstile;
  cargador: CargadorTurnstile & ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  /** Opciones del último widget creado. */
  opciones: () => OpcionesTurnstile;
  /** Cuántos widgets se crearon. */
  creados: () => number;
  resolver: (token: string) => void;
  vencer: () => void;
  fallar: () => void;
};

export function crearTurnstileFalso(): TurnstileFalso {
  const todas: OpcionesTurnstile[] = [];
  const render = vi.fn((_contenedor: HTMLElement, opciones: OpcionesTurnstile) => {
    todas.push(opciones);
    return `widget-${todas.length}`;
  });
  const reset = vi.fn();
  const remove = vi.fn();
  const api: ApiTurnstile = { render, reset, remove };
  const cargador = vi.fn(() => Promise.resolve(api)) as TurnstileFalso['cargador'];
  const ultima = (): OpcionesTurnstile => {
    const opciones = todas.at(-1);
    if (!opciones) throw new Error('Todavía no se creó ningún widget.');
    return opciones;
  };
  return {
    api,
    cargador,
    render,
    reset,
    remove,
    opciones: ultima,
    creados: () => todas.length,
    resolver: (token) => act(() => ultima().callback(token)),
    vencer: () => act(() => ultima()['expired-callback']()),
    fallar: () => act(() => ultima()['error-callback']()),
  };
}
