// B08 · T08.1 · Lógica de mover y avisar que no voy: `solicitar_movimiento` y `solicitar_cancelacion`.
// SOL-02, SOL-03, SOL-07, SOL-10, RES-07, AGE-11; CA-13, CA-22, CA-41, CA-63. SEC-17: nunca `details` crudos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MENSAJES, mensajePendientesSol10 } from "../../../../src/lib/errores";
import {
  agendaDelProfesorDeClase,
  alcancesDeClase,
  falloCambio,
  MENSAJES_CAMBIOS,
  puedePedirCambio,
  solicitarCancelacion,
  solicitarMovimiento,
  useCambioDeClase as useCambioDeClaseReal,
  type ClaseMia,
} from "../../../../src/modulos/mis-clases/logica";
import { useCambioDeClase } from "../../../../src/modulos/mis-clases/logica/useCambioDeClase";

const real = vi.hoisted(() => ({ cliente: null as unknown }));
vi.mock("../../../../src/lib/supabase", () => ({
  cargarSupabase: async () => real.cliente,
}));

type Resultado = { data: unknown; error: unknown };

function cliente(r: Resultado) {
  const c = { rpc: vi.fn(async () => r) };
  return {
    c,
    deps: { obtenerCliente: async () => c as unknown as SupabaseClient },
  };
}

const err = (
  message: string,
  details: string | null = null,
  code = "PT409",
) => ({ code, message, details, hint: null });

function clase(cambios: Partial<ClaseMia> = {}): ClaseMia {
  return {
    id: "c1",
    inicio: "2026-11-16T13:00:00+00:00",
    fin: "2026-11-16T14:00:00+00:00",
    estado: "confirmada",
    quien_toma: "Ana",
    persona_a_cargo_id: null,
    observacion: null,
    reserva_tipo: "serie",
    frecuencia: 1,
    solicitud_pendiente: null,
    pasada: false,
    reserva_id: "r1",
    profesor_id: "pa",
    profesor_nombre: "Profe A",
    profesor_slug: "profe-a",
    zona_horaria: "America/Montevideo",
    ...cambios,
  };
}

const DESTINO = "2026-11-17T10:00:00-03:00";

describe("alcances y habilitación", () => {
  it("SOL_02_SOL_03_desde_aca_solo_en_una_serie", () => {
    expect(alcancesDeClase(clase())).toEqual(["solo_esta", "desde_aca"]);
    expect(
      alcancesDeClase(clase({ reserva_tipo: "suelta", frecuencia: null })),
    ).toEqual(["solo_esta"]);
    expect(MENSAJES_CAMBIOS.alcance.desde_aca).toBe("De acá en adelante");
  });

  it("SOL_02_puede_pedir_cambio_solo_confirmada_futura_sin_pendiente", () => {
    expect(puedePedirCambio(clase())).toBe(true);
    expect(puedePedirCambio(clase({ estado: "pendiente" }))).toBe(false);
    expect(puedePedirCambio(clase({ estado: "movida" }))).toBe(false);
    expect(puedePedirCambio(clase({ pasada: true }))).toBe(false);
    expect(
      puedePedirCambio(
        clase({
          solicitud_pendiente: {
            id: "s",
            tipo: "cancelacion",
            alcance: "solo_esta",
            vencida: false,
          },
        }),
      ),
    ).toBe(false);
    expect(
      puedePedirCambio(
        clase({
          solicitud_pendiente: {
            id: "s",
            tipo: "movimiento",
            alcance: "solo_esta",
            vencida: true,
          },
        }),
      ),
    ).toBe(true);
  });

  it("RES_07_destino_en_la_agenda_del_profesor_de_la_clase", () => {
    expect(
      agendaDelProfesorDeClase(
        clase({
          profesor_id: "pb",
          profesor_slug: "profe-b",
          zona_horaria: "Europe/Madrid",
        }),
      ),
    ).toEqual({
      profesorId: "pb",
      slug: "profe-b",
      zona: "Europe/Madrid",
    });
    expect(agendaDelProfesorDeClase(clase({ zona_horaria: null }))?.zona).toBe(
      "America/Montevideo",
    );
    expect(agendaDelProfesorDeClase(clase({ profesor_slug: null }))).toBeNull();
  });
});

describe("solicitarMovimiento", () => {
  it("SOL_02_SOL_07_llama_la_rpc_y_devuelve_fechas_y_salteadas", async () => {
    const { c, deps } = cliente({
      data: {
        solicitud_id: "s1",
        fechas: ["2026-11-17T13:00:00+00:00", "2026-12-01T13:00:00+00:00"],
        salteadas: ["2026-11-24T13:00:00+00:00"],
      },
      error: null,
    });
    const r = await solicitarMovimiento(clase(), DESTINO, "desde_aca", deps);
    expect(c.rpc).toHaveBeenCalledWith("solicitar_movimiento", {
      p_clase_id: "c1",
      p_destino: DESTINO,
      p_alcance: "desde_aca",
    });
    expect(r).toEqual({
      ok: true,
      solicitudId: "s1",
      fechas: ["2026-11-17T13:00:00+00:00", "2026-12-01T13:00:00+00:00"],
      salteadas: ["2026-11-24T13:00:00+00:00"],
    });
  });

  it("SOL_02_rechaza_desde_aca_en_suelta_y_destino_vacio_sin_llamar", async () => {
    const { c, deps } = cliente({ data: null, error: null });
    const suelta = clase({ reserva_tipo: "suelta" });
    expect(
      await solicitarMovimiento(suelta, DESTINO, "desde_aca", deps),
    ).toEqual({
      ok: false,
      codigo: "DATOS_INVALIDOS",
      mensaje: MENSAJES_CAMBIOS.alcanceInvalido,
      campo: "alcance",
    });
    expect(
      await solicitarMovimiento(clase(), "", "solo_esta", deps),
    ).toMatchObject({ ok: false, campo: "destino" });
    expect(
      await solicitarMovimiento(clase(), null, "solo_esta", deps),
    ).toMatchObject({ ok: false, campo: "destino" });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("RES_07_fuera_de_grilla_marca_el_destino", async () => {
    const { deps } = cliente({
      data: null,
      error: err("FUERA_DE_GRILLA", null, "PT422"),
    });
    expect(
      await solicitarMovimiento(clase(), DESTINO, "solo_esta", deps),
    ).toEqual({
      ok: false,
      codigo: "FUERA_DE_GRILLA",
      mensaje: MENSAJES.FUERA_DE_GRILLA,
      campo: "destino",
    });
  });

  it("CA_22_hueco_destino_ocupado_marca_el_destino", async () => {
    const { deps } = cliente({
      data: null,
      error: err("HUECO_NO_LIBRE", '{"inicio":"2026-11-17T13:00:00+00:00"}'),
    });
    expect(
      await solicitarMovimiento(clase(), DESTINO, "solo_esta", deps),
    ).toMatchObject({
      codigo: "HUECO_NO_LIBRE",
      mensaje: MENSAJES.HUECO_NO_LIBRE,
      campo: "destino",
    });
  });

  it("SOL_10_CA_41_limite_excedido_dice_el_limite", async () => {
    const { deps } = cliente({
      data: null,
      error: err(
        "LIMITE_EXCEDIDO",
        '{"tope":"pendientes","limite":10}',
        "PT429",
      ),
    });
    const r = await solicitarMovimiento(clase(), DESTINO, "solo_esta", deps);
    expect(r).toEqual({
      ok: false,
      codigo: "LIMITE_EXCEDIDO",
      mensaje: mensajePendientesSol10(10),
      campo: null,
    });
    expect(!r.ok && r.mensaje).toContain("10");
  });

  it("AGE_11_CA_63_profesor_inactivo_con_su_texto", async () => {
    const { deps } = cliente({ data: null, error: err("PROFESOR_INACTIVO") });
    expect(
      await solicitarMovimiento(clase(), DESTINO, "solo_esta", deps),
    ).toEqual({
      ok: false,
      codigo: "PROFESOR_INACTIVO",
      mensaje: MENSAJES_CAMBIOS.profesorInactivo,
      campo: null,
    });
  });

  it("CA_13_anticipacion_insuficiente_con_las_horas", async () => {
    const { deps } = cliente({
      data: null,
      error: err(
        "ANTICIPACION_INSUFICIENTE",
        '{"horas_minimas":24,"inicio":"2026-11-03T12:00:00+00:00"}',
        "PT422",
      ),
    });
    const r = await solicitarMovimiento(clase(), DESTINO, "solo_esta", deps);
    expect(r).toMatchObject({
      ok: false,
      codigo: "ANTICIPACION_INSUFICIENTE",
      campo: null,
    });
    expect(!r.ok && r.mensaje).toContain("24");
    expect(!r.ok && r.mensaje).not.toContain("2026-11-03");
  });

  it("CA_13_H_363_anticipacion_dice_si_falla_el_horario_nuevo_o_la_clase", async () => {
    const detalle = (inicio: string) =>
      err(
        "ANTICIPACION_INSUFICIENTE",
        `{"horas_minimas":24,"inicio":"${inicio}"}`,
        "PT422",
      );
    const destino = await solicitarMovimiento(
      clase(),
      DESTINO,
      "solo_esta",
      cliente({ data: null, error: detalle("2026-11-17T13:00:00+00:00") }).deps,
    );
    expect(destino).toMatchObject({
      ok: false,
      codigo: "ANTICIPACION_INSUFICIENTE",
      mensaje: MENSAJES_CAMBIOS.anticipacionDestino(24),
      campo: null,
    });
    // Mismo instante que clase().inicio escrito en otro huso: es la clase de origen.
    const origen = await solicitarMovimiento(
      clase(),
      DESTINO,
      "solo_esta",
      cliente({ data: null, error: detalle("2026-11-16T10:00:00-03:00") }).deps,
    );
    expect(origen).toMatchObject({
      ok: false,
      mensaje: MENSAJES_CAMBIOS.anticipacionClase(24),
    });
    const cancelar = await solicitarCancelacion(
      clase(),
      "solo_esta",
      cliente({ data: null, error: detalle("2026-11-16T13:00:00+00:00") }).deps,
    );
    expect(cancelar).toMatchObject({
      ok: false,
      mensaje: MENSAJES_CAMBIOS.anticipacionClase(24),
    });
    // Sin la clase o con un inicio ilegible, queda el mensaje del catálogo con las horas.
    for (const r of [
      falloCambio(detalle("2026-11-16T13:00:00+00:00")),
      falloCambio(detalle("no-fecha"), clase().inicio),
    ]) {
      expect(r.mensaje).toContain("24");
      expect([
        MENSAJES_CAMBIOS.anticipacionClase(24),
        MENSAJES_CAMBIOS.anticipacionDestino(24),
      ]).not.toContain(r.mensaje);
    }
  });

  it("SEC_17_respuesta_inesperada_o_red_da_mensaje_generico_sin_detalles", async () => {
    const { deps } = cliente({ data: { otra: 1 }, error: null });
    expect(
      await solicitarMovimiento(clase(), DESTINO, "solo_esta", deps),
    ).toMatchObject({ ok: false, codigo: "DESCONOCIDO" });
    const caido = {
      obtenerCliente: async () =>
        Promise.reject(new TypeError("Failed to fetch")),
    };
    expect(
      await solicitarMovimiento(clase(), DESTINO, "solo_esta", caido),
    ).toMatchObject({ ok: false, codigo: "SIN_CONEXION" });
  });
});

describe("solicitarCancelacion", () => {
  it("SOL_03_llama_la_rpc_y_devuelve_la_solicitud", async () => {
    const { c, deps } = cliente({ data: { solicitud_id: "s2" }, error: null });
    expect(await solicitarCancelacion(clase(), "desde_aca", deps)).toEqual({
      ok: true,
      solicitudId: "s2",
    });
    expect(c.rpc).toHaveBeenCalledWith("solicitar_cancelacion", {
      p_clase_id: "c1",
      p_alcance: "desde_aca",
    });
  });

  it("SOL_03_desde_aca_en_suelta_no_llama", async () => {
    const { c, deps } = cliente({ data: null, error: null });
    expect(
      await solicitarCancelacion(
        clase({ reserva_tipo: "suelta" }),
        "desde_aca",
        deps,
      ),
    ).toMatchObject({
      ok: false,
      campo: "alcance",
    });
    expect(c.rpc).not.toHaveBeenCalled();
  });

  it("SOL_10_CA_41_429_y_409_del_catalogo", async () => {
    const tope = cliente({
      data: null,
      error: err(
        "LIMITE_EXCEDIDO",
        '{"tope":"pendientes","limite":10}',
        "PT429",
      ),
    });
    expect(
      await solicitarCancelacion(clase(), "solo_esta", tope.deps),
    ).toMatchObject({
      codigo: "LIMITE_EXCEDIDO",
      mensaje: mensajePendientesSol10(10),
    });
    const enCurso = cliente({
      data: null,
      error: err("SOLICITUD_EN_CURSO", '{"solicitud_id":"s0"}'),
    });
    expect(
      await solicitarCancelacion(clase(), "solo_esta", enCurso.deps),
    ).toEqual({
      ok: false,
      codigo: "SOLICITUD_EN_CURSO",
      mensaje: MENSAJES.SOLICITUD_EN_CURSO,
      campo: null,
    });
    const pasada = cliente({ data: null, error: err("CLASE_NO_MODIFICABLE") });
    expect(
      await solicitarCancelacion(clase(), "solo_esta", pasada.deps),
    ).toMatchObject({ mensaje: MENSAJES.CLASE_NO_MODIFICABLE });
  });

  it("SEC_09_datos_invalidos_del_servidor_en_su_campo", () => {
    expect(
      falloCambio(err("DATOS_INVALIDOS", '{"campo":"p_alcance"}', "PT422")),
    ).toMatchObject({ campo: "alcance" });
    expect(
      falloCambio(err("DATOS_INVALIDOS", '{"campo":"p_destino"}', "PT422")),
    ).toMatchObject({ campo: "destino" });
    expect(falloCambio(err("DATOS_INVALIDOS", "no-json", "PT422"))).toEqual({
      ok: false,
      codigo: "DATOS_INVALIDOS",
      mensaje: MENSAJES.DATOS_INVALIDOS,
      campo: null,
    });
    expect(
      falloCambio(err("DATOS_INVALIDOS", '{"otro":1}', "PT422")),
    ).toMatchObject({ campo: null });
  });
});

describe("useCambioDeClase", () => {
  it("SOL_02_SOL_03_guarda_envio_y_resultado", async () => {
    const { deps } = cliente({
      data: { solicitud_id: "s3", fechas: ["f"], salteadas: [] },
      error: null,
    });
    const { result } = renderHook(() => useCambioDeClase(deps));
    expect(result.current).toMatchObject({ enviando: false, resultado: null });
    await act(async () => {
      await result.current.mover(clase(), DESTINO, "solo_esta");
    });
    expect(result.current.resultado).toEqual({
      ok: true,
      solicitudId: "s3",
      fechas: ["f"],
      salteadas: [],
    });
    act(() => result.current.limpiar());
    expect(result.current.resultado).toBeNull();
  });

  it("SOL_03_cancelar_con_fallo_queda_traducido", async () => {
    const { deps } = cliente({ data: null, error: err("PROFESOR_INACTIVO") });
    const { result } = renderHook(() => useCambioDeClase(deps));
    await act(async () => {
      await result.current.cancelar(clase(), "solo_esta");
    });
    expect(result.current.resultado).toMatchObject({
      ok: false,
      mensaje: MENSAJES_CAMBIOS.profesorInactivo,
    });
  });

  it("SOL_03_hook_real_usa_supabase_cargado", async () => {
    real.cliente = cliente({ data: { solicitud_id: "s4" }, error: null }).c;
    const { result } = renderHook(() => useCambioDeClaseReal());
    let r: unknown;
    await act(async () => {
      r = await result.current.cancelar(clase(), "solo_esta");
    });
    expect(r).toEqual({ ok: true, solicitudId: "s4" });
  });
});
