"""Convierte un fotograma del vídeo completo en la miniatura del README.

Sustituye el subtítulo incrustado por una píldora «Watch the demo · <duración>» con la
tipografía de la app. Espera un fotograma 1920 × 1080 exportado por Recordly con los
subtítulos en una banda bajo el marco, como el de la toma del 1 de octubre.

Uso: python scripts/make-thumbnail.py fotograma.png 1:51 (requiere Pillow).
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
fonts = root / "src" / "app" / "fonts"
output = root / "docs" / "media" / "demo-thumbnail.webp"

INK = (32, 35, 31)
PAPER = (246, 245, 241)
MUTED = (178, 182, 174)

if len(sys.argv) != 3:
    sys.exit("Uso: python scripts/make-thumbnail.py fotograma.png 1:51")
frame_path, duration = sys.argv[1], sys.argv[2]

with Image.open(frame_path) as source:
    image = source.convert("RGB")
if image.size != (1920, 1080):
    sys.exit(f"El fotograma mide {image.size[0]} × {image.size[1]}; se esperaba 1920 × 1080.")

# Bajo el marco hay una sombra en degradado vertical: cada fila del subtítulo se rellena
# interpolando entre píxeles limpios a ambos lados, no con un color plano.
pixels = image.load()
left, right = 680, 1240
for y in range(998, 1080):
    a, b = pixels[left, y], pixels[right, y]
    for x in range(left + 1, right):
        t = (x - left) / (right - left)
        pixels[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

# La píldora se dibuja a 4× y se reduce para que los bordes salgan suavizados.
scale = 4
label = ImageFont.truetype(str(fonts / "ibm-plex-sans-latin-600-normal.woff2"), 27 * scale)
meta = ImageFont.truetype(str(fonts / "ibm-plex-sans-latin-400-normal.woff2"), 27 * scale)
measure = ImageDraw.Draw(Image.new("L", (1, 1)))
title = "Watch the demo"
title_width = measure.textlength(title, font=label)
meta_width = measure.textlength(duration, font=meta)
pad, triangle, icon_gap, text_gap, dot = 30 * scale, 17 * scale, 18 * scale, 16 * scale, 6 * scale
height = 64 * scale
width = int(pad + triangle + icon_gap + title_width + text_gap + dot + text_gap + meta_width + pad)

pill = Image.new("RGBA", (width, height), (0, 0, 0, 0))
draw = ImageDraw.Draw(pill)
draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=height // 2, fill=INK)
middle = height / 2
x = pad
draw.polygon([(x, middle - triangle * 0.62), (x, middle + triangle * 0.62), (x + triangle, middle)], fill=PAPER)
x += triangle + icon_gap
draw.text((x, middle), title, font=label, fill=PAPER, anchor="lm")
x += title_width + text_gap
draw.ellipse((x, middle - dot / 2, x + dot, middle + dot / 2), fill=MUTED)
x += dot + text_gap
draw.text((x, middle), duration, font=meta, fill=MUTED, anchor="lm")
pill = pill.resize((width // scale, height // scale), Image.LANCZOS)
image.paste(pill, ((1920 - pill.width) // 2, 1040 - pill.height // 2), pill)

image.resize((1600, 900), Image.LANCZOS).save(output, "WEBP", quality=90, method=6)
print(f"Miniatura creada: {output}")
