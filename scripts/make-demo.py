"""Codifica las cinco capturas reales de Playwright como GIF, sin alterar su contenido.

Uso: python scripts/make-demo.py (requiere Pillow).
"""
from pathlib import Path

from PIL import Image

media = Path(__file__).resolve().parents[1] / "docs" / "media"
frames = [Image.open(media / f"step-{index}.png").convert("RGB") for index in range(1, 6)]
try:
    frames[0].save(
        media / "demo.gif",
        save_all=True,
        append_images=frames[1:],
        duration=[3000, 4000, 5000, 3000, 5000],
        loop=0,
        optimize=True,
    )
finally:
    for frame in frames:
        frame.close()
print(f"GIF creado: {media / 'demo.gif'}")
