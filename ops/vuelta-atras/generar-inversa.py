#!/usr/bin/env python
"""Arma inversa-b14.sql (ADR-021 §8) a partir del catalogo de una base en el estado de B05.

Entradas (ver ops/vuelta-atras/README.md, "Regenerar"):
  --esquema  salida de `pg_dump -s -n public -n privado --no-owner` sobre una base migrada hasta 202611000504
  --catalogo  salida de catalogo-b05.sql sobre esa misma base
  --funciones  una fila por funcion de public y privado de esa base: (schema,nombre,args_identidad,args,resultado)
  --cuerpo  plantilla con los pasos de datos y de tablas (inversa-b14.cuerpo.sql)
Salida: --salida (UTF-8, finales LF). No toca ninguna base.
"""
import argparse
import re
import sys

ap = argparse.ArgumentParser()
ap.add_argument("--esquema", required=True)
ap.add_argument("--funciones", required=True)
ap.add_argument("--catalogo", required=True)
ap.add_argument("--cuerpo", required=True)
ap.add_argument("--salida", required=True)
a = ap.parse_args()

texto = open(a.esquema, encoding="utf-8").read().replace("\r\n", "\n")
bloques = re.split(r"\n--\n(?=-- Name: )", texto)
por_tipo = {}
for b in bloques:
    m = re.match(r"-- Name: (.*?); Type: ([A-Z ]+); Schema: ([^;]*);", b)
    if not m:
        continue
    cuerpo = "\n".join(l for l in b.split("\n") if not l.startswith("--") and not l.startswith("SET ")).strip()
    por_tipo.setdefault(m.group(2), []).append((m.group(1), m.group(3), cuerpo))

def sql(tipo, filtro=lambda n, s: True):
    return "\n\n".join(c for n, s, c in por_tipo.get(tipo, []) if filtro(n, s) and c)

funciones = sql("FUNCTION").replace("CREATE FUNCTION ", "CREATE OR REPLACE FUNCTION ")
vistas = sql("VIEW")
triggers = sql("TRIGGER")
politicas = sql("POLICY")
acl_func = sql("ACL", lambda n, s: n.startswith("FUNCTION "))
acl_vistas = sql("ACL", lambda n, s: n.startswith("TABLE v_"))
filas = [l.strip().rstrip(",") for l in open(a.funciones, encoding="utf-8") if l.strip().startswith("(")]
catalogo = ",\n    ".join(l.strip().rstrip(",") for l in open(a.catalogo, encoding="utf-8") if l.strip().startswith("("))
valores = ",\n    ".join(filas)

m = re.search(r"CONSTRAINT mail_salida_tipo_check CHECK \(\(tipo = ANY \(ARRAY\[(.*?)\]\)\)\)", texto)
if not m:
    sys.exit("no se encontro mail_salida_tipo_check en el esquema de B05")
tipos = "array[" + m.group(1).replace("::text", "") + "]"

plantilla = open(a.cuerpo, encoding="utf-8").read()
for marca, valor in {
    "@@FUNCIONES_B05@@": valores,
    "@@CATALOGO_B05@@": catalogo,
    "@@TIPOS_MAIL_B05@@": tipos,
    "@@CHECK_TIPO_MAIL_B05@@": f"constraint mail_salida_tipo_check check (tipo = any ({tipos}))",
    "@@CREAR_FUNCIONES@@": funciones,
    "@@CREAR_VISTAS@@": vistas,
    "@@ACL_VISTAS@@": acl_vistas,
    "@@CREAR_TRIGGERS@@": triggers,
    "@@CREAR_POLITICAS@@": politicas,
    "@@ACL_FUNCIONES@@": acl_func,
}.items():
    if marca not in plantilla:
        sys.exit(f"falta la marca {marca} en la plantilla")
    plantilla = plantilla.replace(marca, valor)
with open(a.salida, "w", encoding="utf-8", newline=chr(10)) as f:
    f.write(plantilla)
