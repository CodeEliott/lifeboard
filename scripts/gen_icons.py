"""Draw Lifeboard's pixel cartridge icon as SVG (favicon, logo) and PNGs (home screen).

No dependencies: the PNGs are written by hand with zlib. Run from the project root:
    python3 scripts/gen_icons.py
The three label stripes are the three v1 plugins: RepLog, Sleep, Appearance Lab.
"""
import struct
import zlib
from pathlib import Path

GRID = [
    "................",
    ".OOOOOOOOOOO....",
    ".OKKKKKKKKKKO...",
    ".OKDKDKDKDKKKO..",
    ".OKKKKKKKKKKKKO.",
    ".OKYYYYYYYYYYKO.",
    ".OKYYYYYYYYYYKO.",
    ".OKLLLLLLLLLLKO.",
    ".OKLLLLLLLLLLKO.",
    ".OKBBBBBBBBBBKO.",
    ".OKBBBBBBBBBBKO.",
    ".OKKKKKKKKKKKKO.",
    ".OKKKKKKKKKKKKO.",
    ".ODDDDDDDDDDDDO.",
    ".OOOOOOOOOOOOOO.",
    "................",
]
COLORS = {
    "O": "#1D1A2B",  # outline
    "K": "#E4E2EB",  # console plastic
    "D": "#A9A3BE",  # plastic shade, grip ridges
    "Y": "#FFC83D",  # RepLog
    "L": "#A99BFF",  # Sleep
    "B": "#6EA6FF",  # Appearance Lab
}
BACKGROUND = "#4E4963"  # the console bezel, behind the home-screen icon

ROOT = Path(__file__).resolve().parent.parent / "icons"


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def svg():
    rects = []
    for y, row in enumerate(GRID):
        x = 0
        while x < len(row):
            ch = row[x]
            if ch == ".":
                x += 1
                continue
            start = x
            while x < len(row) and row[x] == ch:
                x += 1
            rects.append(f'<rect x="{start}" y="{y}" width="{x - start}" height="1" fill="{COLORS[ch]}"/>')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">'
        + "".join(rects)
        + "</svg>\n"
    )


def png(size, fill_ratio=0.8):
    cell = int(size * fill_ratio // 16)
    offset = (size - cell * 16) // 2
    bg = rgb(BACKGROUND)
    rows = []
    for py in range(size):
        row = bytearray([0])  # filter: none
        gy = (py - offset) // cell if py >= offset else -1
        for px in range(size):
            gx = (px - offset) // cell if px >= offset else -1
            ch = GRID[gy][gx] if 0 <= gy < 16 and 0 <= gx < 16 else "."
            row += bytes(rgb(COLORS[ch]) if ch != "." else bg)
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


def main():
    ROOT.mkdir(exist_ok=True)
    (ROOT / "icon.svg").write_text(svg())
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        (ROOT / name).write_bytes(png(size))
    print("Wrote", ", ".join(p.name for p in sorted(ROOT.iterdir())))


if __name__ == "__main__":
    main()
