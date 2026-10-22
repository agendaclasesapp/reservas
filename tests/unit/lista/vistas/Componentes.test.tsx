// @vitest-environment jsdom
// Componentes sueltos de la lista (T05.2): ListaAlumnos, TarjetaCuenta, formato y la página conectada a logica/.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListaAlumnos } from '../../../../src/modulos/lista/vistas/ListaAlumnos';
import { TarjetaCuenta } from '../../../../src/modulos/lista/vistas/TarjetaCuenta';
import {
  formatearNacimiento,
  INSIGNIA_ESTADO,
  nombreVisible,
  textoEdad,
  textoOpcional,
} from '../../../../src/modulos/lista/vistas/formato';
import { sinViolacionesAxe } from '../../ui/soporte';
import { alumno } from './soporte';

const logica = vi.hoisted(() => ({
  estado: { estado: 'cargando', alumnos: [], error: null } as Record<string, unknown>,
  recargar: vi.fn(),
  aprobarCuenta: vi.fn(),
}));

vi.mock('../../../../src/modulos/lista/logica', async (importarOriginal) => ({
  ...(await importarOriginal<object>()),
  useAlumnos: () => ({ datos: logica.estado, recargar: logica.recargar }),
  aprobarCuenta: logica.aprobarCuenta,
}));
vi.mock('../../../../src/modulos/agenda/logica', () => ({
  useConfigPublica: () => ({ estado: 'listo', config: { zona_horaria: 'America/Montevideo' }, error: null }),
}));

import Pagina from '../../../../src/modulos/lista/vistas/Pagina';

afterEach(cleanup);

describe('formato (ALU-09, CA-07)', () => {
  it('textoEdad_usa_singular_plural_y_sin_dato', () => {
    expect(textoEdad(1)).toBe('1 año');
    expect(textoEdad(0)).toBe('0 años');
    expect(textoEdad(26)).toBe('26 años');
    expect(textoEdad(null)).toBe('Sin dato');
  });

  it('formatearNacimiento_y_textoOpcional_y_nombreVisible', () => {
    expect(formatearNacimiento('1990-02-03')).toBe('3 de febrero de 1990');
    expect(formatearNacimiento(null)).toBe('Sin dato');
    expect(formatearNacimiento('')).toBe('Sin dato');
    expect(formatearNacimiento('no-es-fecha')).toBe('no-es-fecha');
    expect(textoOpcional('')).toBe('Sin dato');
    expect(textoOpcional('x')).toBe('x');
    expect(nombreVisible(null)).toBe('Sin nombre');
    expect(nombreVisible('  ')).toBe('Sin nombre');
    expect(nombreVisible('Ana')).toBe('Ana');
  });

  it('ALU_09_los_cuatro_estados_tienen_texto_propio', () => {
    expect(Object.values(INSIGNIA_ESTADO).map((i) => i.texto)).toEqual(['Pendiente', 'Aprobado', 'Rechazado', 'Sin cuenta']);
  });
});

describe('ListaAlumnos (C-67)', () => {
  const props = { onAgregar: vi.fn(), onEditar: vi.fn(), onAprobar: vi.fn(), onRevisarUnion: vi.fn() };

  it('ALU_09_un_alumno_sin_nombre_ni_datos_muestra_Sin_nombre_y_Sin_dato', async () => {
    const vacio = alumno({
      id: 'x',
      nombre: null,
      telefono: null,
      mail: null,
      fecha_nacimiento: null,
      como_llego: null,
      edad: null,
      con_usuario: false,
      estado: 'sin_cuenta',
    });
    const { container } = render(<ListaAlumnos alumnos={[vacio]} {...props} />);
    const fila = screen.getByRole('row', { name: /Sin nombre/ });
    expect(within(fila).getAllByText('Sin dato').length).toBeGreaterThanOrEqual(5);
    await sinViolacionesAxe(container);
  });

  it('WEB_07_los_botones_de_la_fila_llaman_a_sus_acciones_con_el_alumno', async () => {
    const rechazada = alumno({ id: 'r1', estado: 'rechazado', nombre: 'Rita' });
    const aprobada = alumno({ id: 'a2', nombre: 'Ana' });
    render(<ListaAlumnos alumnos={[rechazada, aprobada]} {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Rita' }));
    expect(props.onEditar).toHaveBeenCalledWith(rechazada);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Rita' }));
    expect(props.onAprobar).toHaveBeenCalledWith(rechazada);
    await userEvent.click(screen.getByRole('button', { name: 'Revisar unión de Ana' }));
    expect(props.onRevisarUnion).toHaveBeenCalledWith(aprobada);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar alumno' }));
    expect(props.onAgregar).toHaveBeenCalledOnce();
  });

  it('WEB_07_la_operacion_en_curso_marca_el_boton_con_aria_busy', () => {
    render(<ListaAlumnos alumnos={[alumno({ id: 'r1', estado: 'rechazado', nombre: 'Rita' })]} ocupadoId="r1" {...props} />);
    const boton = screen.getByRole('button', { name: 'Aprobar cuenta de Rita' });
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect(boton.textContent).toBe('Aprobando…');
  });
});

describe('TarjetaCuenta (C-63)', () => {
  it('ALU_03_rechazando_deshabilita_Aprobar_y_Rechazar_y_con_error_lo_muestra_en_un_alert', async () => {
    const { container } = render(
      <TarjetaCuenta cuenta={alumno({ estado: 'pendiente' })} ocupada="rechazando" error="Esa cuenta ya no está pendiente." onAprobar={vi.fn()} onRechazar={vi.fn()} />,
    );
    expect((screen.getByRole('button', { name: 'Aprobar cuenta de Ana Pérez' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Rechazar cuenta de Ana Pérez' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Esa cuenta ya no está pendiente.');
    await sinViolacionesAxe(container);
  });

  it('ALU_03_el_nombre_visible_de_cada_boton_esta_contenido_en_su_nombre_accesible', () => {
    render(<TarjetaCuenta cuenta={alumno({ estado: 'pendiente' })} onAprobar={vi.fn()} onRechazar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^Aprobar/ }).textContent).toBe('Aprobar');
    expect(screen.getByRole('button', { name: /^Rechazar/ }).textContent).toBe('Rechazar');
  });
});

describe('Página #/lista conectada a logica/ (WEB-07)', () => {
  it('WEB_07_con_datos_de_useAlumnos_muestra_cuentas_y_alumnos_y_aprobar_llama_a_aprobarCuenta', async () => {
    logica.estado = {
      estado: 'listo',
      alumnos: [alumno({ id: 'p1', estado: 'pendiente', nombre: 'Bruno Díaz' }), alumno()],
      error: null,
    };
    logica.aprobarCuenta.mockResolvedValue({ ok: true, estado: 'aprobado', sugerencias: [] });
    const { container } = render(<Pagina />);
    expect(screen.getByRole('heading', { level: 1, name: 'Lista' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Cuentas pendientes' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Alumnos' })).toBeTruthy();
    await sinViolacionesAxe(container);
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar cuenta de Bruno Díaz' }));
    await waitFor(() => expect(logica.aprobarCuenta).toHaveBeenCalledWith('p1', null));
    await waitFor(() => expect(logica.recargar).toHaveBeenCalledOnce());
  });
});
