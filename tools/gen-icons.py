#!/usr/bin/env python3
"""產生 PWA 圖示。

圖案是「( ▪ ) 括號夾著一塊小圖」—— 這個工具在做的正是把照片的一塊嵌進
句子的括號裡，所以圖示直接畫那個意象，小尺寸下也還認得出來。

用法：python3 tools/gen-icons.py
輸出：public/icons/ 底下四張 PNG
"""

from pathlib import Path
from PIL import Image, ImageDraw

BG = (109, 92, 240)      # --accent #6d5cf0
FG = (255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)

    # maskable 會被系統裁成圓形或圓角方形，主體要縮進安全區
    scale = 0.62 if maskable else 0.78
    cx = cy = size / 2
    unit = size * scale

    # 中間那塊「小圖」
    cw, ch = unit * 0.34, unit * 0.46
    d.rounded_rectangle(
        [cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2],
        radius=max(2, int(unit * 0.05)),
        fill=FG,
    )

    # 左右括號：畫橢圓的左半 / 右半
    stroke = max(2, int(unit * 0.075))
    rx, ry = unit * 0.12, unit * 0.40
    gap = unit * 0.34  # 括號與中間小圖的距離

    for side in (-1, 1):
        ex = cx + side * gap
        box = [ex - rx, cy - ry, ex + rx, cy + ry]
        start, end = (90, 270) if side < 0 else (270, 90)
        d.arc(box, start=start, end=end, fill=FG, width=stroke)

    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    targets = [
        ("icon-192.png", 192, False),
        ("icon-512.png", 512, False),
        ("icon-512-maskable.png", 512, True),
        ("apple-touch-icon-180.png", 180, False),
    ]
    for name, size, maskable in targets:
        path = OUT / name
        draw_icon(size, maskable).save(path)
        print(f"wrote {path.relative_to(OUT.parent.parent)} ({size}x{size})")


if __name__ == "__main__":
    main()
