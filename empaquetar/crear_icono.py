"""Genera el icono de EditorVentana: una ventana (marco con cruz de parteluz) sobre papel
de calco azul, con un lápiz que la está trazando.

Uso:  .venv-motor\\Scripts\\python.exe empaquetar\\crear_icono.py
Salida: empaquetar\\icono.ico (16-256 px) y empaquetar\\icono.png (512 px)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

S = 1024  # se dibuja grande y se reduce para suavizar bordes
AQUI = Path(__file__).parent


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def dibujar():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # Fondo: cuadrado redondeado con degradado azul (color de acento del editor)
    fondo = Image.new("RGBA", (S, S))
    arriba, abajo = (24, 140, 190), (8, 82, 118)
    for y in range(S):
        ImageDraw.Draw(fondo).line([(0, y), (S, y)], fill=lerp(arriba, abajo, y / S) + (255,))
    mascara = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([40, 40, S - 40, S - 40], radius=210, fill=255)
    sombra = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sombra).rounded_rectangle([40, 60, S - 40, S - 22], radius=210, fill=(0, 30, 50, 110))
    img.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(18)))
    img.paste(fondo, (0, 0), mascara)

    # Cuadrícula tenue de mesa de calco (en capa aparte para que la transparencia mezcle)
    rejilla = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rejilla)
    for k in range(1, 8):
        p = 40 + k * (S - 80) // 8
        rd.line([(p, 90), (p, S - 90)], fill=(255, 255, 255, 38), width=4)
        rd.line([(90, p), (S - 90, p)], fill=(255, 255, 255, 38), width=4)
    rejilla.putalpha(Image.composite(rejilla.split()[3], Image.new("L", (S, S), 0), mascara))
    img.alpha_composite(rejilla)

    d = ImageDraw.Draw(img)

    # Ventana: marco blanco, cristales celestes, parteluz en cruz
    x0, y0, x1, y1 = 230, 220, 750, 800
    d.rounded_rectangle([x0, y0, x1, y1], radius=26, fill=(255, 255, 255, 255))
    m = 34  # grosor del marco
    cx, cy = (x0 + x1) // 2, y0 + (y1 - y0) * 9 // 20
    cristal = (196, 228, 242, 255)
    for (a, b, c, e) in [(x0 + m, y0 + m, cx - m // 2, cy - m // 2), (cx + m // 2, y0 + m, x1 - m, cy - m // 2),
                         (x0 + m, cy + m // 2, cx - m // 2, y1 - m), (cx + m // 2, cy + m // 2, x1 - m, y1 - m)]:
        d.rounded_rectangle([a, b, c, e], radius=8, fill=cristal)
        # brillo diagonal en cada cristal
        d.polygon([(a + 18, e - 40), (a + 18, e - 110), (a + 110, b + 18), (a + 180, b + 18)], fill=(232, 245, 251, 255))
    # alféizar
    d.rounded_rectangle([x0 - 34, y1 - 6, x1 + 34, y1 + 40], radius=14, fill=(232, 240, 245, 255))

    # Lápiz en diagonal, trazando la esquina inferior derecha
    lapiz = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lapiz)
    L, W = 470, 92
    cx0, cy0 = S // 2, S // 2
    ld.rectangle([cx0 - W // 2, cy0 - L // 2, cx0 + W // 2, cy0 + L // 2 - 120], fill=(255, 183, 3, 255))       # cuerpo
    ld.rectangle([cx0 - W // 2, cy0 - L // 2, cx0 - W // 6, cy0 + L // 2 - 120], fill=(255, 205, 70, 255))      # luz
    ld.rectangle([cx0 + W // 6, cy0 - L // 2, cx0 + W // 2, cy0 + L // 2 - 120], fill=(230, 150, 0, 255))       # sombra
    ld.rectangle([cx0 - W // 2, cy0 - L // 2 - 70, cx0 + W // 2, cy0 - L // 2], fill=(160, 170, 180, 255))      # virola
    ld.rounded_rectangle([cx0 - W // 2, cy0 - L // 2 - 140, cx0 + W // 2, cy0 - L // 2 - 60], radius=22,
                         fill=(240, 110, 120, 255))                                                              # goma
    ld.polygon([(cx0 - W // 2, cy0 + L // 2 - 120), (cx0 + W // 2, cy0 + L // 2 - 120), (cx0, cy0 + L // 2 + 10)],
               fill=(245, 214, 170, 255))                                                                        # madera
    ld.polygon([(cx0 - 20, cy0 + L // 2 - 32), (cx0 + 20, cy0 + L // 2 - 32), (cx0, cy0 + L // 2 + 10)],
               fill=(30, 42, 51, 255))                                                                           # mina
    lapiz = lapiz.rotate(38, resample=Image.BICUBIC, center=(cx0, cy0))
    sl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sl.paste((0, 25, 40, 90), (0, 0), lapiz.split()[3])
    dx, dy = 150, 110  # punta del lápiz sobre la esquina inferior derecha de la ventana
    img.alpha_composite(sl.filter(ImageFilter.GaussianBlur(12)).crop((0, 0, S - dx - 14, S - dy - 18)), (dx + 14, dy + 18))
    img.alpha_composite(lapiz.crop((0, 0, S - dx, S - dy)), (dx, dy))
    return img


def main():
    img = dibujar()
    img.resize((512, 512), Image.LANCZOS).save(AQUI / "icono.png")
    tam = [256, 128, 64, 48, 32, 24, 16]
    img.resize((256, 256), Image.LANCZOS).save(AQUI / "icono.ico", sizes=[(t, t) for t in tam])
    print("Icono creado en", AQUI)


if __name__ == "__main__":
    main()
