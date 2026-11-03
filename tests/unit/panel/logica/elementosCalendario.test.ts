// B18 · T18.1 · Elementos tocables del calendario: clase, hueco libre y bloqueo (ADR-024 A-3, A-4).
// CAL-05, CAL-06, CAL-11, CA-70, CA-71, INV-01, INV-05, H-473 (carriles), H-474 (configuración en error).
import { describe, expect, it } from 'vitest';
import type { TramoGrilla } from '../../../../src/modulos/configuracion/logica';
import {
  accionesBloqueo,
  accionesFila,
  asignarCarriles,
  calendarioConElementos,
  configuracionCalendario,
  diasCalendario,
  duracionDeHuecosLibres,
  ejeCalendario,
  intervaloVisual,
  permisosPanel,
  posicionEnEje,
  type ElementoBloqueo,
  type ElementoCalendario,
  type ElementoClase,
  type ElementoHueco,
  type FilaAgendaDias,
} from '../../../../src/modulos/panel/logica';

/** Montevideo es UTC−3 todo el año. El 30/10/2026 es viernes. */
const ZONA = 'America/Montevideo';
const DIA = '2026-10-30';

/** AGE-01: grilla inicial, lunes a viernes de 08:00 a 13:00 y de 14:00 a 18:00. */
const GRILLA_INICIAL: TramoGrilla[] = ([1, 2, 3, 4, 5] as const).flatMap((d) => [
  { dia_semana: d, desde: '08:00', hasta: '13:00' },
  { dia_semana: d, desde: '14:00', hasta: '18:00' },
]);
const CONFIGURACION = { grilla: GRILLA_INICIAL, duracionMin: 30 };

/** Instante del 30/10/2026 a la hora local `HH:MM` del profesor. */
function a(hora: string): string {
  const [h, m] = hora.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(2026, 9, 30, h + 3, m)).toISOString().replace('.000Z', '+00:00');
}

function fila(desde: string, hasta: string, cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias {
  return {
    inicio: a(desde),
    fin: a(hasta),
    estado: 'libre',
    clase_id: null,
    solicitud_id: null,
    quien_toma: null,
    titular: null,
    observacion: null,
    clase_estado: null,
    bloqueo_id: null,
    bloqueo_motivo: null,
    reserva_tipo: null,
    pasada: false,
    dia: DIA,
    clase_inicio: null,
    clase_fin: null,
    solicitud_tipo: null,
    ...cambios,
  };
}

function clase(id: string, desde: string, hasta: string, cambios: Partial<FilaAgendaDias> = {}): FilaAgendaDias {
  return fila(desde, hasta, {
    estado: 'ocupado',
    clase_id: id,
    quien_toma: 'Ana Pérez',
    titular: 'Ana Pérez',
    observacion: 'Traer raqueta',
    clase_estado: 'confirmada',
    reserva_tipo: 'suelta',
    clase_inicio: a(desde),
    clase_fin: a(hasta),
    ...cambios,
  });
}

function bloqueado(desde: string, hasta: string, bloqueoId: string | null, motivo: string | null = null): FilaAgendaDias {
  return fila(desde, hasta, { estado: 'bloqueado', bloqueo_id: bloqueoId, bloqueo_motivo: motivo });
}

function elementos(
  filas: FilaAgendaDias[],
  activo = true,
  configuracion: typeof CONFIGURACION | null = CONFIGURACION,
): ElementoCalendario[] {
  const dias = diasCalendario([DIA], filas, ZONA);
  return calendarioConElementos(dias, configuracion, ZONA, activo).columnas[0]!.elementos;
}

function deTipo<T extends ElementoCalendario['tipo']>(lista: ElementoCalendario[], tipo: T) {
  return lista.filter((e): e is Extract<ElementoCalendario, { tipo: T }> => e.tipo === tipo);
}

describe('huecos libres (CAL-05, CA-70)', () => {
  it('CAL_05_CA_70_un_hueco_libre_futuro_dentro_de_tramo_es_tocable_y_ofrece_crear_clase', () => {
    const [hueco] = deTipo(elementos([fila('10:00', '10:30')]), 'hueco') as [ElementoHueco];
    expect(hueco).toMatchObject({ tocable: true, dentroDeTramo: true, pasado: false, inicioMin: 600, finMin: 630 });
    expect(hueco.acciones.crear).toBe(true);
    expect(hueco.accionesBloqueo.bloquear).toBe(true);
  });

  it('CAL_05_CA_70_un_hueco_libre_que_ya_paso_es_decorativo', () => {
    const [hueco] = deTipo(elementos([fila('09:00', '09:30', { pasada: true })]), 'hueco') as [ElementoHueco];
    expect(hueco).toMatchObject({ tocable: false, pasado: true, dentroDeTramo: true });
    expect(hueco.acciones.crear).toBe(false);
  });

  it('CAL_05_CA_70_fuera_de_la_grilla_el_fondo_va_sombreado_y_un_hueco_ahi_no_se_toca', () => {
    const dias = diasCalendario([DIA], [fila('13:00', '13:30'), fila('19:00', '19:30')], ZONA);
    const { columnas, eje, grillaConocida } = calendarioConElementos(dias, CONFIGURACION, ZONA, true);
    expect(grillaConocida).toBe(true);
    expect(columnas[0]!.zonasFueraDeTramo).toEqual([{ desdeMin: 780, hastaMin: 840 }]);
    // A-1: con la grilla conocida, los huecos no amplían el eje (solo las clases).
    expect(eje).toMatchObject({ desdeHora: 8, hastaHora: 18 });
    const huecos = deTipo(columnas[0]!.elementos, 'hueco');
    expect(huecos.map((h) => [h.dentroDeTramo, h.tocable])).toEqual([
      [false, false],
      [false, false],
    ]);
  });

  it('CAL_05_la_posicion_sale_de_posicionEnEje_y_los_elementos_van_en_orden_horario', () => {
    const dias = diasCalendario([DIA], [fila('11:00', '11:30'), clase('c1', '09:00', '10:00'), bloqueado('10:00', '10:30', 'b1')], ZONA);
    const { columnas, eje } = calendarioConElementos(dias, CONFIGURACION, ZONA, true);
    const lista = columnas[0]!.elementos;
    expect(lista.map((e) => e.tipo)).toEqual(['clase', 'bloqueo', 'hueco']);
    for (const e of lista) expect(e.posicion).toEqual(posicionEnEje(e.inicioMin, e.finMin, eje));
    expect(new Set(lista.map((e) => e.clave)).size).toBe(3);
  });
});

describe('bloqueos (CAL-06, CA-71)', () => {
  it('CAL_06_CA_71_un_bloqueo_con_motivo_Torneo_trae_el_motivo_y_ofrece_desbloquear', () => {
    const filas = [bloqueado('10:00', '10:30', 'b1', 'Torneo'), bloqueado('10:30', '11:00', 'b1', 'Torneo')];
    const [bloqueo] = deTipo(elementos(filas), 'bloqueo') as [ElementoBloqueo];
    expect(bloqueo).toMatchObject({
      motivo: 'Torneo',
      bloqueoId: 'b1',
      propio: true,
      tocable: true,
      inicio: a('10:00'),
      fin: a('11:00'),
      inicioMin: 600,
      finMin: 660,
    });
    expect(bloqueo.filas).toHaveLength(2);
    expect(bloqueo.accionesBloqueo).toEqual(accionesBloqueo(filas[0]!));
    expect(bloqueo.accionesBloqueo.desbloquear).toBe(true);
  });

  it('CAL_06_bloqueos_distintos_o_no_seguidos_van_aparte_y_sin_motivo_queda_null', () => {
    const filas = [bloqueado('09:00', '09:30', 'b1'), bloqueado('09:30', '10:00', 'b2'), bloqueado('11:00', '11:30', 'b2')];
    const bloqueos = deTipo(elementos(filas), 'bloqueo');
    expect(bloqueos.map((b) => [b.bloqueoId, b.filas.length, b.motivo])).toEqual([
      ['b1', 1, null],
      ['b2', 1, null],
      ['b2', 1, null],
    ]);
  });

  it('CAL_06_un_bloqueo_sin_bloqueo_id_no_es_propio_ni_se_toca', () => {
    const [bloqueo] = deTipo(elementos([bloqueado('10:00', '10:30', null, 'Feriado')]), 'bloqueo') as [ElementoBloqueo];
    expect(bloqueo).toMatchObject({ propio: false, tocable: false, motivo: 'Feriado' });
  });
});

describe('clases (CAL-11, INV-01)', () => {
  it('CAL_11_INV_01_una_clase_confirmada_de_una_serie_ofrece_mover_cancelar_y_alcance_como_la_lista', () => {
    const filas = [clase('c1', '10:00', '11:00', { reserva_tipo: 'serie' })];
    const [c] = deTipo(elementos(filas), 'clase') as [ElementoClase];
    expect(c).toMatchObject({ tocable: true, gestionable: true, inicioMin: 600, finMin: 660 });
    expect(c.acciones).toEqual({ crear: false, mover: true, cancelar: true, elegirAlcance: true });
    expect(c.acciones).toEqual(accionesFila(c.clase.fila, true));
    expect(c.clase).toMatchObject({ quien: 'Ana Pérez', titular: 'Ana Pérez', observacion: 'Traer raqueta' });
  });

  it('CAL_11_una_clase_con_solicitud_id_se_ve_pero_no_se_gestiona', () => {
    const [c] = deTipo(elementos([clase('c1', '10:00', '10:30', { solicitud_id: 's1', solicitud_tipo: 'cancelacion' })]), 'clase') as [
      ElementoClase,
    ];
    expect(c).toMatchObject({ tocable: true, gestionable: false });
    expect(c.acciones).toMatchObject({ mover: false, cancelar: false });
  });

  it('CAL_11_una_clase_pasada_o_pendiente_no_se_gestiona', () => {
    const lista = deTipo(
      elementos([
        clase('c1', '08:00', '08:30', { pasada: true }),
        clase('c2', '10:00', '10:30', { clase_estado: 'pendiente', solicitud_id: 's2', solicitud_tipo: 'reserva' }),
      ]),
      'clase',
    );
    expect(lista.map((c) => [c.clase.id, c.gestionable, c.pasado])).toEqual([
      ['c1', false, true],
      ['c2', false, false],
    ]);
  });

  it('INV_01_las_acciones_de_cada_elemento_son_las_de_accionesFila_y_accionesBloqueo_sin_reglas_propias', () => {
    const filas = [
      fila('08:00', '08:30', { pasada: true }),
      fila('08:30', '09:00'),
      clase('c1', '09:00', '09:30'),
      clase('c2', '09:30', '10:00', { reserva_tipo: 'serie', solicitud_id: 's1' }),
      clase('c3', '10:00', '10:30', { pasada: true }),
      bloqueado('11:00', '11:30', 'b1', 'Torneo'),
      bloqueado('11:30', '12:00', null),
    ];
    for (const activo of [true, false]) {
      for (const e of elementos(filas, activo)) {
        if (e.tipo === 'clase') expect(e.acciones).toEqual(accionesFila(e.clase.fila, activo));
        if (e.tipo === 'hueco') {
          expect(e.acciones).toEqual(accionesFila(e.fila, activo));
          expect(e.accionesBloqueo).toEqual(accionesBloqueo(e.fila));
        }
        if (e.tipo === 'bloqueo') expect(e.accionesBloqueo).toEqual(accionesBloqueo(e.filas[0]!));
      }
    }
  });
});

describe('profesor inactivo (INV-05, CA-79)', () => {
  it('INV_05_inactivo_el_hueco_se_toca_sin_crear_y_la_clase_solo_cancela', () => {
    const lista = elementos([fila('10:00', '10:30'), clase('c1', '11:00', '11:30')], false);
    const [hueco] = deTipo(lista, 'hueco') as [ElementoHueco];
    const [c] = deTipo(lista, 'clase') as [ElementoClase];
    expect(permisosPanel(false)).toEqual({ crear: false, mover: false, cancelar: true });
    expect(hueco.acciones.crear).toBe(false);
    expect(hueco.accionesBloqueo.bloquear).toBe(true);
    expect(hueco.tocable).toBe(true);
    expect(c.acciones).toMatchObject({ mover: false, cancelar: true });
    expect(c.gestionable).toBe(true);
  });
});

describe('carriles (ADR-024 A-4, H-473)', () => {
  it('H_473_el_intervalo_visual_dura_al_menos_165_sobre_el_alto_de_la_hora', () => {
    expect(intervaloVisual(600, 605, 16.5)).toEqual({ desdeMin: 600, hastaMin: 610 });
    expect(intervaloVisual(600, 660, 5.5)).toEqual({ desdeMin: 600, hastaMin: 660 });
    expect(intervaloVisual(600, 610, 5.5)).toEqual({ desdeMin: 600, hastaMin: 630 });
  });

  it('H_473_con_huecos_de_30_min_nada_se_pisa_y_todo_va_en_un_carril', () => {
    const lista = elementos([fila('10:00', '10:30'), clase('c1', '10:30', '11:30'), bloqueado('11:30', '12:00', 'b1')]);
    expect(lista.map((e) => [e.carril, e.carriles])).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
    ]);
  });

  it('H_473_NFR_12_huecos_de_5_min_que_se_pisan_dibujados_van_lado_a_lado', () => {
    const filas = [fila('10:00', '10:05'), fila('10:05', '10:10'), fila('10:10', '10:15'), fila('10:30', '10:35')];
    const dias = diasCalendario([DIA], filas, ZONA);
    const { eje, columnas } = calendarioConElementos(dias, { grilla: GRILLA_INICIAL, duracionMin: 5 }, ZONA, true);
    expect(eje.altoHoraRem).toBe(16.5);
    expect(columnas[0]!.elementos.map((e) => [e.inicioMin, e.carril, e.carriles])).toEqual([
      [600, 0, 2],
      [605, 1, 2],
      [610, 0, 2],
      [630, 0, 1],
    ]);
  });

  it('H_473_una_cadena_de_solapes_usa_el_primer_carril_libre_y_conserva_el_orden_de_entrada', () => {
    const intervalos = [
      { inicioMin: 640, finMin: 700 },
      { inicioMin: 600, finMin: 660 },
      { inicioMin: 610, finMin: 620 },
      { inicioMin: 620, finMin: 635 },
      { inicioMin: 720, finMin: 750 },
    ];
    expect(asignarCarriles(intervalos, 5.5)).toEqual([
      { carril: 1, carriles: 3 },
      { carril: 0, carriles: 3 },
      { carril: 1, carriles: 3 },
      { carril: 2, carriles: 3 },
      { carril: 0, carriles: 1 },
    ]);
    expect(asignarCarriles([], 5.5)).toEqual([]);
  });
});

describe('configuración en error o sin datos (ADR-024 A-3, H-474)', () => {
  it('H_474_configuracionCalendario_es_null_en_error_o_sin_datos_y_usa_el_dato_anterior_al_releer', () => {
    const datos = { config: { duracion_min: 45 }, grilla: GRILLA_INICIAL };
    expect(configuracionCalendario({ estado: 'error', datos })).toBeNull();
    expect(configuracionCalendario({ estado: 'cargando', datos: null })).toBeNull();
    expect(configuracionCalendario({ estado: 'listo', datos })).toEqual({ grilla: GRILLA_INICIAL, duracionMin: 45 });
    expect(configuracionCalendario({ estado: 'cargando', datos })).toEqual({ grilla: GRILLA_INICIAL, duracionMin: 45 });
  });

  it('H_474_sin_configuracion_no_hay_zonas_fuera_de_tramo_y_el_eje_se_amplia_por_los_huecos_leidos', () => {
    const filas = [fila('07:00', '07:15'), fila('13:00', '13:30'), bloqueado('19:00', '19:30', 'b1'), clase('c1', '20:00', '20:30')];
    const dias = diasCalendario([DIA], filas, ZONA);
    const { eje, columnas, grillaConocida } = calendarioConElementos(dias, null, ZONA, true);
    expect(grillaConocida).toBe(false);
    expect(columnas[0]!.zonasFueraDeTramo).toEqual([]);
    expect(eje).toMatchObject({ desdeHora: 7, hastaHora: 21 });
    // La duración se infiere del menor hueco libre (15 min): 11 rem.
    expect(eje.altoHoraRem).toBe(11);
    const huecos = deTipo(columnas[0]!.elementos, 'hueco');
    expect(huecos.map((h) => [h.inicioMin, h.dentroDeTramo, h.tocable])).toEqual([
      [420, true, true],
      [780, true, true],
    ]);
  });

  it('H_474_sin_configuracion_y_sin_huecos_libres_el_alto_es_el_base_y_el_eje_08_a_18', () => {
    expect(duracionDeHuecosLibres([bloqueado('10:00', '10:30', 'b1')])).toBeNaN();
    const dias = diasCalendario([DIA], [bloqueado('10:00', '10:30', 'b1')], ZONA);
    const { eje } = calendarioConElementos(dias, null, ZONA, true);
    expect(eje).toMatchObject({ desdeHora: 8, hastaHora: 18, altoHoraRem: 5.5 });
    expect(eje).toEqual(ejeCalendario([], Number.NaN));
  });

  it('H_474_sin_configuracion_un_hueco_pasado_sigue_sin_tocarse', () => {
    const [hueco] = deTipo(elementos([fila('10:00', '10:30', { pasada: true })], true, null), 'hueco') as [ElementoHueco];
    expect(hueco.tocable).toBe(false);
  });
});
