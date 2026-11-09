// @vitest-environment jsdom
// B22 · T22.1 (UX web): matriz de axe por estado del calendario (CA-89; A11Y-48, `accesibilidad.md` §2) y contrato de las
// hojas de estilo de las vistas del Panel con lo que jsdom no calcula (A11Y-43, A11Y-44, A11Y-45, A11Y-46; NFR-11, NFR-12;
// CA-90). jsdom no hace layout ni contraste: la medición real a 360 y 320 px, el zoom y el contraste las hace Playwright
// (`celular.spec.ts`, `accesibilidad.spec.ts`); acá se fija que las reglas que las garantizan estén en el CSS y que
// ningún valor visual salga de los tokens.
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ejeCalendario } from '../../../../src/modulos/panel/logica';
import { sinViolacionesAxe } from '../../ui/soporte';
import {
  bloqueoEn,
  calendarioDe,
  claseEn,
  DIA,
  fila,
  H11,
  H12,
  LIBRE_11,
  LIBRE_12,
  libreEn,
  LIMITES,
  montar,
  montarSemana,
  ocupada,
} from './soporte';

afterEach(cleanup);

const PENDIENTE = ocupada({ inicio: H11, fin: H12, clase_id: 'c2', clase_estado: 'pendiente', solicitud_id: 's1', quien_toma: 'Bruno Díaz' });
const BLOQUEO = fila({ inicio: '2026-11-12T16:00:00Z', fin: '2026-11-12T17:00:00Z', estado: 'bloqueado', bloqueo_id: 'b1', bloqueo_motivo: 'Torneo' });
const AHORA = (dia: string) => (dia === DIA ? { arribaHoras: 2.5, hora: '10:30' } : null);
const AHORA_SEMANA = (dia: string) => (dia === LIMITES.hoy ? { arribaHoras: 2.5, hora: '10:30' } : null);

describe('CA-89 · axe sin violaciones en cada estado de la vista Día (A11Y-48; 1280 y 360 px)', () => {
  const CASOS: [string, () => ReturnType<typeof montar>][] = [
    ['cargando', () => montar([], { modo: 'calendario', calendario: { estado: 'cargando' } })],
    ['error', () => montar([], { modo: 'calendario', calendario: { estado: 'error', mensaje: 'No pudimos leer.' } })],
    ['vacío con huecos libres', () => montar([LIBRE_11, LIBRE_12], { modo: 'calendario' })],
    ['con clases', () => montar([ocupada(), LIBRE_12], { modo: 'calendario' })],
    ['con una pendiente', () => montar([PENDIENTE, LIBRE_12], { modo: 'calendario' })],
    ['con un bloqueo', () => montar([BLOQUEO, LIBRE_11], { modo: 'calendario' })],
    ['con la hora de ahora', () => montar([ocupada(), LIBRE_11], { modo: 'calendario', lineaAhora: AHORA })],
    [
      'con cancelación pendiente',
      () => {
        const f = ocupada({ solicitud_id: 's9' });
        return montar([f], { modo: 'calendario', calendario: calendarioDe([f], DIA, true, { s9: 'cancelacion' }) });
      },
    ],
    ['releyendo', () => montar([ocupada(), LIBRE_11], { modo: 'calendario', calendarioReleyendo: true })],
    ['profesor inactivo', () => montar([ocupada(), LIBRE_11], { modo: 'calendario', profesorActivo: false })],
    ['«Ver como lista»', () => montar([ocupada(), PENDIENTE, LIBRE_12], { modo: 'lista' })],
  ];

  it.each(CASOS)('A11Y_48_Dia_%s', async (_estado, montarCaso) => {
    const { container } = montarCaso();
    await sinViolacionesAxe(container);
  });

  it('CA_89_Dia_con_el_detalle_de_una_clase_abierto_como_dialogo_en_pantalla_angosta', async () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario', escritorio: false });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    await sinViolacionesAxe(await screen.findByRole('dialog'));
  });

  it('CA_89_Dia_con_el_detalle_de_un_hueco_libre_Crear_clase_como_dialogo', async () => {
    montar([ocupada(), LIBRE_11], { modo: 'calendario', escritorio: false });
    await userEvent.click(screen.getByRole('button', { name: /11:00 a 12:00, Libre/ }));
    await sinViolacionesAxe(await screen.findByRole('dialog'));
  });

  it('CA_89_Dia_con_el_detalle_de_un_bloqueo_abierto_en_columna_en_escritorio', async () => {
    const { container } = montar([BLOQUEO, LIBRE_11], { modo: 'calendario', escritorio: true });
    await userEvent.click(screen.getByRole('button', { name: /Bloqueado, Torneo/ }));
    await screen.findByRole('heading', { level: 2, name: /13:00/ });
    await sinViolacionesAxe(container);
  });
});

describe('CA-89 · axe sin violaciones en cada estado de la vista Semana (A11Y-48; 1280 y 360 px)', () => {
  const D = '2026-10-27';
  const CASOS: [string, () => ReturnType<typeof montarSemana>][] = [
    ['cargando', () => montarSemana([], { calendario: { estado: 'cargando' } })],
    ['error', () => montarSemana([], { calendario: { estado: 'error', mensaje: 'No pudimos leer.' } })],
    ['vacía con huecos libres', () => montarSemana([libreEn(D, 9), libreEn(D, 10)])],
    ['con clases', () => montarSemana([claseEn(D, 10), libreEn(D, 11)])],
    ['con una pendiente', () => montarSemana([claseEn(D, 10, { clase_estado: 'pendiente', solicitud_id: 's1', quien_toma: 'Bruno Díaz' })])],
    ['con un bloqueo', () => montarSemana([bloqueoEn(D, 9, 'Torneo'), libreEn(D, 11)])],
    ['con la hora de ahora', () => montarSemana([claseEn('2026-11-02', 10)], { dia: '2026-11-04', lineaAhora: AHORA_SEMANA })],
    ['en la ventana de 3 días', () => montarSemana([claseEn('2026-10-30', 10), libreEn('2026-10-31', 10)], { ventana: true })],
    ['con días fuera del rango', () => montarSemana([libreEn('2025-11-01', 10)], { dia: '2025-11-01' })],
    ['releyendo', () => montarSemana([claseEn(D, 10)], { calendarioReleyendo: true })],
    ['profesor inactivo', () => montarSemana([claseEn(D, 10), libreEn(D, 11)], { profesorActivo: false })],
    ['«Ver como lista» agrupada por día', () => montarSemana([claseEn(D, 10), libreEn(D, 11)], { modo: 'lista' })],
  ];

  it.each(CASOS)('A11Y_48_Semana_%s', async (_estado, montarCaso) => {
    const { container } = montarCaso();
    await sinViolacionesAxe(container);
  });

  it('CA_89_Semana_con_el_detalle_abierto_como_dialogo_en_la_ventana_de_3_dias', async () => {
    montarSemana([claseEn('2026-10-30', 10), libreEn('2026-10-30', 11)], { ventana: true });
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    await sinViolacionesAxe(await screen.findByRole('dialog'));
  });

  it('CA_89_Semana_con_el_detalle_abierto_en_columna_en_escritorio', async () => {
    const { container } = montarSemana([claseEn('2026-10-30', 10), libreEn('2026-10-30', 11)]);
    await userEvent.click(screen.getByRole('button', { name: /10:00 a 11:00, Confirmada/ }));
    await screen.findByRole('heading', { level: 2, name: /10:00/ });
    await sinViolacionesAxe(container);
  });
});

/** Las hojas de las vistas del calendario (no las de formularios del Panel, que son de ciclos anteriores). */
const HOJAS = [
  'Calendario.module.css',
  'BloqueClase.module.css',
  'BloqueBloqueo.module.css',
  'HuecoLibre.module.css',
  'BarraCalendario.module.css',
  'AccionesVista.module.css',
  'DetalleCalendario.module.css',
  'ListaPorDia.module.css',
  'ResponderSolicitud.module.css',
];
const DIR = 'src/modulos/panel/vistas';
const css = (nombre: string) => readFileSync(`${DIR}/${nombre}`, 'utf-8').split(String.fromCharCode(13)).join('');

/** El bloque de reglas de un selector (el primero que lo declara). */
function regla(hoja: string, selector: string): string {
  const texto = css(hoja);
  const inicio = texto.indexOf(`${selector} {`);
  if (inicio < 0) throw new Error(`Sin regla ${selector} en ${hoja}.`);
  return texto.slice(inicio, texto.indexOf('}', inicio));
}

describe('A11Y-43, A11Y-44 · 44 × 44 px y sin desplazamiento horizontal a 360 y 320 px (NFR-12, CA-90, ADR-024 A-2)', () => {
  it('A11Y_43_los_items_de_la_grilla_los_encabezados_y_los_controles_de_la_barra_piden_al_menos_el_tactil_minimo', () => {
    expect(regla('BloqueClase.module.css', '.item')).toContain('min-block-size: var(--tactil-min)');
    expect(regla('Calendario.module.css', '.encabezado')).toContain('min-block-size: var(--tactil-min)');
    expect(regla('BarraCalendario.module.css', '.vista')).toContain('min-block-size: var(--tactil-min)');
    expect(regla('BarraCalendario.module.css', '.vista')).toContain('min-inline-size: var(--tactil-min)');
    // Las flechas, «Hoy», «Ver como lista» y «Copiar enlace de este día» son `Boton`, que ya fija 44 × 44.
    expect(readFileSync('src/ui/Boton.module.css', 'utf-8')).toMatch(/min-block-size: var\(--tactil-min\)[\s\S]*min-inline-size: var\(--tactil-min\)/);
    // El token es 2,75 rem = 44 px.
    expect(readFileSync('src/ui/tokens.css', 'utf-8')).toContain('--tactil-min: 2.75rem');
  });

  it('A11Y_43_Hueco_y_Bloqueo_usan_el_mismo_item_que_la_clase_asi_que_ningun_control_baja_de_44_px_de_alto', () => {
    for (const hoja of ['HuecoLibre.module.css', 'BloqueBloqueo.module.css']) expect(css(hoja)).not.toMatch(/block-size:\s*\d/);
    expect(css('HuecoLibre.module.css')).toContain('.item');
    expect(css('BloqueBloqueo.module.css')).toContain('.item');
  });

  it('A11Y_43_ADR_024_A_2_hasta_10_min_el_alto_de_la_hora_da_44_px_y_debajo_de_10_min_el_item_se_clava_en_44_px', () => {
    const REM = 16;
    for (const duracion of [10, 15, 20, 30, 45, 60]) {
      const { altoHoraRem } = ejeCalendario([], duracion);
      expect((altoHoraRem * duracion * REM) / 60).toBeGreaterThanOrEqual(2.75 * REM - 1e-9);
    }
    // Excepción de H-472 (< 10 min): la hora se topa en 16,5 rem y el hueco natural mide menos de 44 px; el CSS lo sostiene en
    // 44 px con `min-block-size` y los que se pisan se reparten en carriles (A-4). La alternativa es «Ver como lista» (CA-83).
    const { altoHoraRem } = ejeCalendario([], 5);
    expect((altoHoraRem * 5 * REM) / 60).toBeLessThan(2.75 * REM);
  });

  it('A11Y_44_la_Semana_angosta_son_3_columnas_de_al_menos_5_rem_con_el_eje_de_3_rem_a_360_y_a_320_px', () => {
    const REM = 16;
    const eje = /--cal-ancho-eje:\s*([\d.]+)rem/.exec(css('Calendario.module.css'))?.[1];
    expect(Number(eje)).toBe(3);
    for (const ancho of [360, 320]) expect((ancho - Number(eje) * REM) / 3).toBeGreaterThanOrEqual(5 * REM);
    expect(regla('Calendario.module.css', '.columnas')).toContain('grid-auto-columns: minmax(0, 1fr)');
    expect(regla('Calendario.module.css', '.cuerpo')).toContain('minmax(0, 1fr)');
  });

  it('A11Y_44_la_barra_y_la_leyenda_pasan_a_otra_linea_y_ninguna_hoja_fija_anchos_ni_desplaza_en_horizontal', () => {
    expect(regla('BarraCalendario.module.css', '.navegacion')).toContain('flex-wrap: wrap');
    expect(regla('BarraCalendario.module.css', '.vistas,\n.flechas')).toContain('flex-wrap: wrap');
    expect(regla('Calendario.module.css', '.leyenda')).toContain('flex-wrap: wrap');
    expect(regla('AccionesVista.module.css', '.acciones')).toContain('flex-wrap: wrap');
    for (const hoja of HOJAS) {
      const texto = css(hoja);
      expect(texto, hoja).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/);
      // Sin anchos en px ni en rem fijos (los de lectura se reparten con `minmax(0, 1fr)`); sí hay `inline-size` de las muestras.
      expect(texto, hoja).not.toMatch(/(?<![-\w])(inline-size|width)\s*:\s*\d+px/);
    }
  });
});

describe('A11Y-42, A11Y-45 · todo sale de los tokens y el texto va en rem (WCAG 1.4.4, 1.4.12)', () => {
  it.each(HOJAS)('A11Y_45_%s_no_tiene_colores_ni_tamanos_de_texto_ni_sombras_literales', (hoja) => {
    const texto = css(hoja).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(texto).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(texto).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/);
    expect(texto).not.toMatch(/font-size:\s*[\d.]+(px|pt)/);
    expect(texto).not.toMatch(/(?<![-\w])\d+px/);
    expect(texto).not.toMatch(/box-shadow:\s*[\d-]/);
  });

  it('A11Y_45_un_nombre_largo_se_corta_solo_a_la_vista_en_el_bloque_y_las_filas_de_estado_no_se_tapan', () => {
    const bloque = css('BloqueClase.module.css');
    expect(regla('BloqueClase.module.css', '.bloque')).toContain('overflow-wrap: anywhere');
    expect(bloque).toContain('white-space: nowrap');
    // El estado (CONFIRMADA / PENDIENTE / Cancelación pendiente) va en su propia línea, antes del nombre.
    expect(regla('BloqueClase.module.css', '.bloque')).toContain('flex-wrap: wrap');
  });
});

describe('A11Y-46 · movimiento reducido (WCAG 2.3.3, 2.2.2)', () => {
  it('A11Y_46_las_hojas_del_calendario_no_animan_nada_ni_usan_scroll_suave', () => {
    for (const hoja of HOJAS) {
      const texto = css(hoja).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(texto, hoja).not.toMatch(/\banimation(-name)?\s*:/);
      expect(texto, hoja).not.toMatch(/scroll-behavior\s*:\s*smooth/);
    }
  });

  it('A11Y_46_la_unica_transicion_de_las_vistas_usa_el_token_de_150_ms_y_tiene_su_prefers_reduced_motion', () => {
    const conTransicion = readdirSync(DIR)
      .filter((n) => n.endsWith('.css'))
      .filter((n) => /\btransition\s*:/.test(css(n).replace(/\/\*[\s\S]*?\*\//g, '')));
    for (const hoja of conTransicion) {
      const texto = css(hoja);
      expect(texto, hoja).toMatch(/transition:\s*[^;]*var\(--mov\)/);
      expect(texto, hoja).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
    }
    expect(readFileSync('src/ui/tokens.css', 'utf-8')).toContain('--mov: 150ms');
    // Red de seguridad global para el resto (esqueleto de carga, resaltado de destino).
    expect(readFileSync('src/ui/base.css', 'utf-8')).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none[\s\S]*transition: none[\s\S]*scroll-behavior: auto/);
  });
});
