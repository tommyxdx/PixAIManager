#!/usr/bin/env python3
"""Makes the Chrome Web Store images from icons/128.png (needs Pillow):

  store/assets/store-icon-128.png       128x128, the icon at 96x96 with 16 px transparent padding
  store/assets/promo-small-440x280.png  small promo tile (required by the store; one image for all languages)

Usage:  python tools/store_images.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store", "assets")
FONTS = "C:/Windows/Fonts"
BG_TOP = (20, 20, 27)  # --panel
BG_BOTTOM = (45, 24, 74)  # a darker shade of --accent
ACCENT = (185, 123, 249)  # --accent-hover
TEXT = (236, 236, 243)  # --text
MUTED = (154, 154, 173)  # --muted


def font(name, size):
    for candidate in (name, "arial.ttf"):
        try:
            return ImageFont.truetype(os.path.join(FONTS, candidate), size)
        except OSError:
            continue
    return ImageFont.load_default()


def fitted(draw, text, name, size, width):
    f = font(name, size)
    while size > 10 and draw.textlength(text, font=f) > width:
        size -= 1
        f = font(name, size)
    return f


def store_icon(icon):
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.alpha_composite(icon.resize((96, 96), Image.LANCZOS), (16, 16))
    canvas.save(os.path.join(OUT, "store-icon-128.png"))


def promo_tile(icon):
    w, h = 440, 280
    tile = Image.new("RGBA", (w, h))
    px = tile.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.45 + y / h * 0.55)
            px[x, y] = tuple(round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t) for i in range(3)) + (255,)
    tile.alpha_composite(icon.resize((104, 104), Image.LANCZOS), (32, 88))
    d = ImageDraw.Draw(tile)
    left, width = 160, w - 160 - 26
    title = fitted(d, "Gallery Manager", "arialbd.ttf", 34, width)
    d.text((left, 82), "Gallery Manager", font=title, fill=TEXT)
    d.text((left, 124), "for PixAI · Unofficial", font=fitted(d, "for PixAI · Unofficial", "arial.ttf", 19, width), fill=ACCENT)
    zh = "PixAI 图库管理（非官方）"
    d.text((left, 156), zh, font=fitted(d, zh, "msyh.ttc", 18, width), fill=TEXT)
    line = "ZIP · PNG · Folders · 中文 / EN"
    d.text((left, 192), line, font=fitted(d, line, "msyh.ttc", 14, width), fill=MUTED)
    tile.convert("RGB").save(os.path.join(OUT, "promo-small-440x280.png"))


def main():
    os.makedirs(OUT, exist_ok=True)
    icon = Image.open(os.path.join(ROOT, "icons", "128.png")).convert("RGBA")
    store_icon(icon)
    promo_tile(icon)
    for name in sorted(os.listdir(OUT)):
        with Image.open(os.path.join(OUT, name)) as im:
            print(name, im.size, im.mode)


if __name__ == "__main__":
    main()
