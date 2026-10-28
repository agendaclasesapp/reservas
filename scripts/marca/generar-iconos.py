"""Genera los derivados del ícono de la marca «Agenda Clases App» (CR-003, WEB-12).

Origen: docs/marca/agenda-clases-app-icono.jpg (2048x2048, círculo sobre fondo blanco).
Se corre a mano desde la raíz del repositorio (no entra en el build ni en CI):

    python scripts/marca/generar-iconos.py

Requiere Pillow. Salidas (PNG con fondo transparente fuera del círculo):
    public/icono-192.png               192x192  círculo completo con texto (encabezado)
    public/apple-touch-icon.png        180x180  círculo completo con texto, sobre fondo blanco
                                                (iOS no admite transparencia)
    docs/marca/agenda-clases-app-120.png 120x120 círculo completo (logo de la pantalla de consentimiento de Google)
    public/favicon-32.png               32x32   solo el dibujo (raquetas y pelota), sin el texto,
                                                que a 32 px no se lee; recorte circular
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

RAIZ = Path(__file__).resolve().parents[2]
ORIGEN = RAIZ / "docs" / "marca" / "agenda-clases-app-icono.jpg"
SUPERMUESTREO = 4


def caja_del_circulo(img: Image.Image) -> tuple[int, int, int, int]:
    """Caja del círculo: los píxeles saturados (el celeste-azul); la sombra y el blanco no lo son."""
    saturacion = img.convert("HSV").getchannel("S").point(lambda v: 255 if v > 90 else 0)
    caja = saturacion.getbbox()
    if caja is None:
        raise SystemExit("No se encontró el círculo en el ícono de origen")
    return caja


def recorte_circular(img: Image.Image, centro: tuple[float, float], radio: float, lado: int) -> Image.Image:
    """Recorta un cuadrado de lado 2*radio alrededor de `centro`, lo escala a `lado` y lo enmascara en círculo."""
    cx, cy = centro
    caja = (round(cx - radio), round(cy - radio), round(cx + radio), round(cy + radio))
    cuadro = img.crop(caja).convert("RGBA")
    grande = lado * SUPERMUESTREO
    mascara = Image.new("L", (grande, grande), 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, grande - 1, grande - 1), fill=255)
    mascara = mascara.resize((lado, lado), Image.LANCZOS)
    salida = cuadro.resize((lado, lado), Image.LANCZOS)
    salida.putalpha(ImageChops.multiply(salida.getchannel("A"), mascara))
    return salida


def guardar(img: Image.Image, ruta: Path) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    img.save(ruta, "PNG", optimize=True)
    print(f"{ruta.relative_to(RAIZ)}  {img.width}x{img.height}")


def main() -> None:
    origen = Image.open(ORIGEN).convert("RGB")
    x0, y0, x1, y1 = caja_del_circulo(origen)
    centro = ((x0 + x1) / 2, (y0 + y1) / 2)
    radio = (x1 - x0) / 2
    # Un pequeño margen hacia adentro evita el borde con la sombra blanca del círculo.
    radio_util = radio - 4

    for lado, ruta in (
        (192, RAIZ / "public" / "icono-192.png"),
        (120, RAIZ / "docs" / "marca" / "agenda-clases-app-120.png"),
    ):
        guardar(recorte_circular(origen, centro, radio_util, lado), ruta)

    # apple-touch-icon: iOS rellena la transparencia de negro, así que va sobre blanco.
    circulo = recorte_circular(origen, centro, radio_util, 180)
    fondo = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
    fondo.alpha_composite(circulo)
    guardar(fondo.convert("RGB"), RAIZ / "public" / "apple-touch-icon.png")

    # favicon: solo el dibujo (sin el texto). Círculo centrado en las raquetas y la pelota,
    # en la mitad superior del círculo grande.
    cx, cy = centro
    dibujo = (cx, cy - radio * 0.30)
    guardar(recorte_circular(origen, dibujo, radio * 0.72, 32), RAIZ / "public" / "favicon-32.png")


if __name__ == "__main__":
    main()
