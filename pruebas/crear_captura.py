"""Genera una captura de prueba parecida a un sistema de escritorio.

Uso: python crear_captura.py  ->  crea captura_prueba.png junto a este archivo.
"""
from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

AQUI = Path(__file__).resolve().parent
W, H = 900, 560
BG = (240, 240, 240)


def fuente(nombre, t):
    try:
        return ImageFont.truetype(nombre, t)
    except OSError:
        return ImageFont.load_default()


def main():
    random.seed(7)
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    tah = fuente("tahoma.ttf", 11)
    tahb = fuente("tahomabd.ttf", 11)
    seg = fuente("segoeui.ttf", 14)

    # barra de título con degradado vertical
    for y in range(30):
        c = (int(28 + y * 2.2), int(80 + y * 2.0), int(150 + y * 2.4))
        d.line([(0, y), (W - 1, y)], fill=c)
    d.text((10, 7), "Registro de Altas Institucionales", font=seg, fill=(255, 255, 255))

    # línea horizontal larga y línea vertical
    d.line([(0, 60), (W - 1, 60)], fill=(160, 160, 160))
    d.line([(450, 61), (450, H - 1)], fill=(160, 160, 160))
    d.text((12, 40), "Datos del Activo Fijo", font=tahb, fill=(20, 20, 140))

    # etiquetas y cajas de texto
    filas = [("Item", "672282430004"), ("Descripción", "PISTOLA DE CALOR 1.5 kW"),
             ("Marca", "AIIO"), ("Modelo", "BXC-2000"), ("Nro Serie", "XCBXBXCB")]
    for i, (lab, val) in enumerate(filas):
        y = 80 + i * 30
        d.text((14, y + 4), lab, font=tah, fill=(26, 26, 156))
        d.rectangle([110, y, 400, y + 20], fill=(255, 255, 255))
        d.line([(110, y), (400, y)], fill=(122, 122, 122))
        d.line([(110, y), (110, y + 20)], fill=(122, 122, 122))
        d.line([(110, y + 20), (400, y + 20)], fill=(205, 205, 205))
        d.line([(400, y), (400, y + 20)], fill=(205, 205, 205))
        d.text((114, y + 4), val, font=tah, fill=(0, 0, 0))

    # botón con degradado vertical
    bx, by, bw, bh = 300, 250, 100, 26
    for y in range(bh):
        v = int(253 - y * 1.1)
        d.line([(bx, by + y), (bx + bw - 1, by + y)], fill=(v, v, v))
    d.rectangle([bx, by, bx + bw - 1, by + bh - 1], outline=(173, 173, 173))
    d.text((bx + 28, by + 6), "Guardar", font=tah, fill=(0, 0, 0))

    # panel con sombra suave (para el modo fusionado)
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).rectangle([40, 330, 390, 500], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(9))
    dark = Image.new("RGB", (W, H), (90, 90, 90))
    im = Image.composite(dark, im, sh)
    d = ImageDraw.Draw(im)
    d.rectangle([34, 322, 384, 492], fill=(250, 250, 250), outline=(180, 180, 180))
    d.text((46, 334), "Observaciones", font=tahb, fill=(20, 20, 140))
    d.text((46, 356), "Equipo revisado en almacén central.", font=tah, fill=(60, 60, 60))

    # zona de "foto": cielo con ruido y una pelota sombreada con bordes suavizados
    S = 4  # se dibuja la pelota a 4x y se reduce, como en una foto real (antialias)
    ball = Image.new("RGB", (330 * S, 220 * S), (150, 40, 20))
    mask = Image.new("L", (330 * S, 220 * S), 0)
    bd, md = ImageDraw.Draw(ball), ImageDraw.Draw(mask)
    for r in range(70 * S, 0, -S):
        k = r / (70 * S)
        o = int((1 - k) * -18 * S)
        box = [150 * S - r + o, 110 * S - r + o, 150 * S + r + o, 110 * S + r + o]
        bd.ellipse(box, fill=(int(150 + 100 * (1 - k)), int(40 + 60 * (1 - k)), int(20 + 30 * (1 - k))))
    md.ellipse([150 * S - 70 * S, 110 * S - 70 * S, 150 * S + 70 * S, 110 * S + 70 * S], fill=255)
    ball = ball.resize((330, 220), Image.BOX)
    mask = mask.resize((330, 220), Image.BOX)
    ph = Image.new("RGB", (330, 220))
    pp = ph.load()
    for y in range(220):
        for x in range(330):
            n = random.randint(-6, 6)
            pp[x, y] = (min(255, 120 + y // 3 + n), min(255, 170 + y // 4 + n), min(255, 225 + n))
    ph = Image.composite(ball, ph, mask)
    im.paste(ph, (510, 300))
    d = ImageDraw.Draw(im)
    d.rectangle([509, 299, 840, 520], outline=(110, 110, 110))

    im.save(AQUI / "captura_prueba.png", optimize=False)
    print("Creada", AQUI / "captura_prueba.png", im.size)


if __name__ == "__main__":
    main()
