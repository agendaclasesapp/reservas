// @vitest-environment jsdom
// Clases filtrables del profesor en `#/lista` (T07.2): WEB-07, PRF-06, CA-29, SOL-08, SEC-16; flujos-profesor.md F-12.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MENSAJES_CLASES,
  type ClaseProfesor,
  type EstadoLectura,
  type FiltroClases,
} from '../../../../src/modulos/lista/logica';
import { SeccionClases, textoTotal } from '../../../../src/modulos/lista/vistas/SeccionClases';
import { sinViolacionesAxe } from '../../ui/soporte';
import { claseProfesor } from './soporte';

afterEach(cleanup);

const LISTO = (filas: ClaseProfesor[]): EstadoLectura<ClaseProfesor> => ({ estado: 'listo', filas, error: null });
const ALUMNOS = [
  { id: 'a1', nombre: 'Ana Pérez' },
  { id: 'a2', nombre: 'Bruno Díaz' },
  { id: 'a3', nombre: null },
];

function montar(datos: EstadoLectura<ClaseProfesor>, filtro: FiltroClases = {}) {
  const onFiltro = vi.fn();
  const onRecargar = vi.fn();
  const r = render(
    <SeccionClases datos={datos} filtro={filtro} alumnos={ALUMNOS} zona="America/Montevideo" onFiltro={onFiltro} onRecargar={onRecargar} />,
  );
  return { ...r, onFiltro, onRecargar };
}

/** La sección con su propio estado de filtro, como la página, para probar «Limpiar filtros» de punta a punta. */
function ConEstado({ datos }: { datos: (f: FiltroClases) => EstadoLectura<ClaseProfesor> }) {
  const [filtro, setFiltro] = useState<FiltroClases>({});
  return (
    <SeccionClases datos={datos(filtro)} filtro={filtro} alumnos={ALUMNOS} zona="America/Montevideo" onFiltro={setFiltro} onRecargar={() => undefined} />
  );
}

describe('estados (F-12)', () => {
  it('WEB_07_mientras_carga_muestra_el_indicador_y_los_filtros', () => {
    montar({ estado: 'cargando', filas: [], error: null });
    expect(screen.getByRole('heading', { level: 2, name: 'Clases' })).toBeTruthy();
    expect(screen.getByLabelText('Desde')).toBeTruthy();
    expect(screen.getByText('Cargando las clases…')).toBeTruthy();
  });

  it('WEB_07_el_error_de_carga_ofrece_reintentar', async () => {
    const { onRecargar } = montar({ estado: 'error', filas: [], error: 'No hay conexión.' });
    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las clases. No hay conexión.');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRecargar).toHaveBeenCalledOnce();
  });

  it('WEB_07_sin_clases_y_sin_filtros_dice_que_todavia_no_hay', () => {
    montar(LISTO([]));
    expect(screen.getByRole('heading', { level: 3, name: 'Todavía no hay clases' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
  });

  it('CA_29_sin_clases_con_filtros_dice_No_hay_clases_con_estos_filtros_y_Limpiar_filtros_los_borra', async () => {
    render(<ConEstado datos={(f) => LISTO(f.alumnoId ? [] : [claseProfesor()])} />);
    await userEvent.selectOptions(screen.getByLabelText('Alumno'), 'a2');
    expect(screen.getByRole('heading', { level: 3, name: 'No hay clases con estos filtros' })).toBeTruthy();
    // Un solo «Limpiar filtros» a la vista, el del estado vacío.
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect((screen.getByLabelText('Alumno') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByRole('heading', { name: 'No hay clases con estos filtros' })).toBeNull();
    expect(screen.getByText('1 clase', { selector: 'p' })).toBeTruthy();
  });
});

describe('filtros y total (CA-29)', () => {
  it('CA_29_el_total_se_anuncia_en_una_region_aria_live_en_singular_y_plural', () => {
    expect(textoTotal(1)).toBe('1 clase');
    expect(textoTotal(0)).toBe('0 clases');
    const { rerender, onFiltro, onRecargar } = montar(LISTO([claseProfesor(), claseProfesor({ id: 'c2' })]));
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('2 clases');
    rerender(
      <SeccionClases datos={LISTO([claseProfesor()])} filtro={{}} alumnos={ALUMNOS} zona="America/Montevideo" onFiltro={onFiltro} onRecargar={onRecargar} />,
    );
    // La misma región cambia de texto: es lo que el lector de pantalla anuncia.
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('1 clase');
  });

  it('CA_29_cambiar_Desde_Hasta_o_Alumno_aplica_el_filtro_con_dias_y_borrar_un_campo_lo_deja_en_null', async () => {
    const { onFiltro, rerender, onRecargar } = montar(LISTO([claseProfesor()]));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-01' } });
    expect(onFiltro).toHaveBeenLastCalledWith({ desde: '2026-11-01' });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-30' } });
    expect(onFiltro).toHaveBeenLastCalledWith({ hasta: '2026-11-30' });
    await userEvent.selectOptions(screen.getByLabelText('Alumno'), 'a2');
    expect(onFiltro).toHaveBeenLastCalledWith({ alumnoId: 'a2' });

    rerender(
      <SeccionClases datos={LISTO([claseProfesor()])} filtro={{ desde: '2026-11-01', alumnoId: 'a2' }} alumnos={ALUMNOS} zona="America/Montevideo" onFiltro={onFiltro} onRecargar={onRecargar} />,
    );
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } });
    expect(onFiltro).toHaveBeenLastCalledWith({ desde: null, alumnoId: 'a2' });
    await userEvent.selectOptions(screen.getByLabelText('Alumno'), '');
    expect(onFiltro).toHaveBeenLastCalledWith({ desde: '2026-11-01', alumnoId: null });
  });

  it('CA_29_el_selector_de_alumno_ofrece_todos_y_un_alumno_sin_nombre_dice_Sin_nombre', () => {
    montar(LISTO([]));
    const opciones = within(screen.getByLabelText('Alumno')).getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(['Todos los alumnos', 'Ana Pérez', 'Bruno Díaz', 'Alumno dado de baja']);
  });

  it('CA_29_con_filtros_ofrece_Limpiar_filtros_junto_a_los_campos', async () => {
    const { onFiltro } = montar(LISTO([claseProfesor()]), { desde: '2026-11-01' });
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onFiltro).toHaveBeenCalledWith({ desde: null, hasta: null, alumnoId: null });
  });

  it('CA_29_hasta_anterior_a_desde_da_error_asociado_al_campo_Hasta_y_no_muestra_lista_ni_total', () => {
    montar(
      { estado: 'error', filas: [], error: MENSAJES_CLASES.rangoInvertido },
      { desde: '2026-11-10', hasta: '2026-11-02' },
    );
    const hasta = screen.getByLabelText('Hasta');
    expect(hasta.getAttribute('aria-invalid')).toBe('true');
    const idError = hasta.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(idError)?.textContent).toBe(MENSAJES_CLASES.rangoInvertido);
    expect(screen.getByRole('alert').textContent).toBe(MENSAJES_CLASES.rangoInvertido);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('CA_29_con_un_rango_valido_no_hay_error_en_Hasta', () => {
    montar(LISTO([claseProfesor()]), { desde: '2026-11-02', hasta: '2026-11-02' });
    expect(screen.getByLabelText('Hasta').getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('clases (PRF-06, SOL-08, SEC-16)', () => {
  it('PRF_06_cada_clase_muestra_fecha_y_hora_en_el_huso_del_profesor_alumno_y_estado', () => {
    montar(LISTO([claseProfesor(), claseProfesor({ id: 'c2', estado: 'cancelada' })]));
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // 13:00 UTC = 10:00 en Montevideo.
    expect(within(items[0]!).getByText('lunes, 2 de noviembre, de 10:00 a 11:00')).toBeTruthy();
    expect(within(items[0]!).getByText('Ana Pérez')).toBeTruthy();
    expect(within(items[0]!).getByText('Confirmada')).toBeTruthy();
    expect(within(items[1]!).getByText('Cancelada')).toBeTruthy();
  });

  it('PRF_06_incluye_las_pasadas_y_la_pendiente_pasada_dice_pendiente_sin_respuesta', () => {
    montar(
      LISTO([
        claseProfesor({ id: 'p1', pasada: true, inicio: '2026-10-05T13:00:00Z', fin: '2026-10-05T14:00:00Z' }),
        claseProfesor({ id: 'p2', pasada: true, estado: 'pendiente' }),
      ]),
    );
    expect(screen.getByText('lunes, 5 de octubre, de 10:00 a 11:00')).toBeTruthy();
    expect(screen.getByText('Pendiente sin respuesta')).toBeTruthy();
  });

  it('PRF_06_una_pendiente_futura_dice_pendiente_de_confirmacion', () => {
    montar(LISTO([claseProfesor({ estado: 'pendiente' })]));
    expect(screen.getByText('Pendiente de confirmación')).toBeTruthy();
  });

  it('PRF_06_serie_quien_toma_distinto_solicitud_pendiente_y_alumno_dado_de_baja', () => {
    montar(
      LISTO([
        claseProfesor({
          id: 'c1',
          reserva_tipo: 'serie',
          frecuencia: 2,
          quien_toma: 'Lucía (hija)',
          solicitud_pendiente: { id: 's1', tipo: 'cancelacion', alcance: 'solo_esta', vencida: false },
        }),
        claseProfesor({ id: 'c2', titular: null, quien_toma: null }),
      ]),
    );
    const [primera, segunda] = screen.getAllByRole('listitem');
    expect(within(primera!).getByText('Serie quincenal')).toBeTruthy();
    expect(within(primera!).getByText('Toma la clase: Lucía (hija)')).toBeTruthy();
    expect(within(primera!).getByText('Solicitud pendiente: Cancelación')).toBeTruthy();
    expect(within(segunda!).getByText('Alumno dado de baja')).toBeTruthy();
  });

  it('SEC_16_el_alumno_quien_toma_y_la_observacion_se_muestran_como_texto', () => {
    const { container } = montar(
      LISTO([claseProfesor({ titular: '<b>Ana</b>', quien_toma: '<i>Lu</i>', observacion: '<img src=x onerror=alert(1)>' })]),
    );
    expect(container.querySelector('b, i, img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
});

describe('accesibilidad (A11Y, WEB-07)', () => {
  it('no_tiene_violaciones_de_axe_con_clases_filtros_activos_error_de_rango_vacio_y_carga', async () => {
    const casos: Array<[EstadoLectura<ClaseProfesor>, FiltroClases]> = [
      [LISTO([claseProfesor(), claseProfesor({ id: 'c2', estado: 'pendiente', pasada: true })]), { desde: '2026-11-01', alumnoId: 'a1' }],
      [{ estado: 'error', filas: [], error: MENSAJES_CLASES.rangoInvertido }, { desde: '2026-11-10', hasta: '2026-11-02' }],
      [LISTO([]), { alumnoId: 'a1' }],
      [{ estado: 'error', filas: [], error: 'Falló.' }, {}],
      [{ estado: 'cargando', filas: [], error: null }, {}],
    ];
    for (const [datos, filtro] of casos) {
      const { container, unmount } = montar(datos, filtro);
      await sinViolacionesAxe(container);
      unmount();
    }
  });
});
