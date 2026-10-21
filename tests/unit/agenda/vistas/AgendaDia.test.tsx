// @vitest-environment jsdom
// Pruebas del contrato de presentación AgendaDia / ListaHuecos (C-21..C-24): WEB-01, AGE-07, NFR-05.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Hueco, LimitesAgenda } from '../../../../src/modulos/agenda/logica';
import { AgendaDia } from '../../../../src/modulos/agenda/vistas/AgendaDia';
import { resumenHuecos, textoRango } from '../../../../src/modulos/agenda/vistas/ListaHuecos';
import { sinViolacionesAxe } from '../../ui/soporte';

afterEach(cleanup);

const ZONA = 'America/Argentina/Buenos_Aires';
const LIMITES: LimitesAgenda = { hoy: '2026-11-02', min: '2025-11-01', max: '2026-12-31' };
const HUECOS: Hueco[] = [
  { inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' },
  { inicio: '2026-11-02T12:00:00+00:00', fin: '2026-11-02T13:00:00+00:00', estado: 'ocupado' },
  { inicio: '2026-11-02T13:00:00+00:00', fin: '2026-11-02T14:00:00+00:00', estado: 'bloqueado' },
];

describe('AgendaDia (C-24)', () => {
  it('WEB_01_cada_estado_de_la_vista_se_dibuja_y_pasa_axe', async () => {
    const vistas = [
      { estado: 'cargando' },
      { estado: 'error', mensaje: 'No se pudo cargar la agenda.', onReintentar: vi.fn() },
      { estado: 'listo', huecos: [] },
      { estado: 'listo', huecos: HUECOS },
    ] as const;
    for (const vista of vistas) {
      const { container, unmount } = render(
        <AgendaDia dia="2026-11-02" zona={ZONA} limites={LIMITES} vista={vista} onCambiarDia={vi.fn()} />,
      );
      await sinViolacionesAxe(container);
      unmount();
    }
  });

  it('WEB_01_sin_onElegirHueco_ningun_hueco_es_interactivo', () => {
    render(<AgendaDia dia="2026-11-02" zona={ZONA} limites={LIMITES} vista={{ estado: 'listo', huecos: HUECOS }} onCambiarDia={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /^\d\d:\d\d a / })).toBeNull();
  });

  it('WEB_01_con_onElegirHueco_solo_el_hueco_libre_es_un_boton_con_hora_y_estado', async () => {
    const onElegirHueco = vi.fn();
    const { container } = render(
      <AgendaDia
        dia="2026-11-02"
        zona={ZONA}
        limites={LIMITES}
        vista={{ estado: 'listo', huecos: HUECOS }}
        onCambiarDia={vi.fn()}
        onElegirHueco={onElegirHueco}
      />,
    );
    const botones = screen.getAllByRole('button', { name: /^\d\d:\d\d a / });
    expect(botones).toHaveLength(1);
    expect(botones[0]?.textContent).toBe('08:00 a 09:00 Libre');
    botones[0]?.focus();
    await userEvent.keyboard('{Enter}');
    expect(onElegirHueco).toHaveBeenCalledWith(HUECOS[0]);
    await sinViolacionesAxe(container);
  });

  it('WEB_01_el_error_llama_a_onReintentar', async () => {
    const onReintentar = vi.fn();
    render(
      <AgendaDia
        dia="2026-11-02"
        zona={ZONA}
        limites={LIMITES}
        vista={{ estado: 'error', mensaje: 'No se pudo cargar la agenda.', onReintentar }}
        onCambiarDia={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('WEB_01_los_botones_de_dia_avisan_el_dia_nuevo_en_el_huso_del_profesor', async () => {
    const onCambiarDia = vi.fn();
    render(<AgendaDia dia="2026-11-02" zona={ZONA} limites={LIMITES} vista={{ estado: 'cargando' }} onCambiarDia={onCambiarDia} />);
    await userEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(onCambiarDia.mock.calls).toEqual([['2026-11-03'], ['2026-11-01']]);
  });
});

describe('ListaHuecos: textos', () => {
  it('AGE_08_textoRango_usa_el_huso_dado_y_no_el_del_navegador', () => {
    const hueco: Hueco = { inicio: '2026-11-02T11:00:00+00:00', fin: '2026-11-02T12:00:00+00:00', estado: 'libre' };
    expect(textoRango(hueco, '2026-11-02', 'America/Argentina/Buenos_Aires')).toBe('08:00 a 09:00');
    expect(textoRango(hueco, '2026-11-02', 'Asia/Tokyo')).toBe('20:00 a 21:00');
  });

  it('WEB_01_resumenHuecos_cuenta_libres_en_singular_plural_y_cero', () => {
    const libre = (n: number): Hueco => ({ inicio: `2026-11-02T1${n}:00:00Z`, fin: `2026-11-02T1${n}:30:00Z`, estado: 'libre' });
    const ocupado: Hueco = { ...libre(5), estado: 'ocupado' };
    expect(resumenHuecos([libre(1), ocupado])).toBe('1 hueco libre de 2.');
    expect(resumenHuecos([libre(1), libre(2), ocupado])).toBe('2 huecos libres de 3.');
    expect(resumenHuecos([ocupado])).toBe('No hay huecos libres este día. Hay 1 en total.');
  });
});
