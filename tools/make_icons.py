# -*- coding: utf-8 -*-
"""纯 Python 生成 PWA 图标（零依赖，不需要 Pillow）。

图形还原原 favicon：蓝色底 #263DD1 + 白色耳机线条（头梁圆弧 + 左右耳罩）。
满幅方形、不含圆角与透明 —— 圆角交给 iOS / Android 系统自己裁，避免二次圆角。

用法（在仓库根目录执行）：
    python tools/make_icons.py

生成到仓库根目录：icon-180.png / icon-192.png / icon-512.png / icon-maskable-512.png
"""
import math
import os
import struct
import zlib

# 图标写到仓库根目录（本脚本的上一级）
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BLUE = (0x26, 0x3D, 0xD1)
WHITE = (0xFF, 0xFF, 0xFF)

CX, CY, R = 16.0, 19.0, 8.0            # 头梁圆弧：圆心 / 半径（32 单位坐标系）
HALF = 1.5                              # 线宽 3 的一半
SEGS = [((8.0, 17.0), (8.0, 24.0)),     # 左耳罩
        ((24.0, 17.0), (24.0, 24.0))]   # 右耳罩


def _seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    L2 = vx * vx + vy * vy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L2))
    return math.hypot(wx - t * vx, wy - t * vy)


def _arc_dist(px, py):
    """头梁只画上半圆（原 SVG 的 a8 8 0 0 1 圆弧）。下半圈不描边，
    端点处的圆头由左右耳罩线段自带的圆角覆盖。"""
    dx, dy = px - CX, py - CY
    if dy <= 0:
        return abs(math.hypot(dx, dy) - R)
    return 1e9


def glyph_cov(px, py, aa):
    d = _arc_dist(px, py)
    for a, b in SEGS:
        dd = _seg_dist(px, py, a, b)
        if dd < d:
            d = dd
    t = (HALF + aa - d) / aa
    return 0.0 if t <= 0 else (1.0 if t >= 1 else t)


def render(size, ss=3, glyph_scale=1.0):
    W = size * ss
    aa = 32.0 / W                        # 约等于 1 个设备像素
    buf = bytearray(W * W * 4)
    for y in range(W):
        row = y * W
        uy = (y + 0.5) / W * 32.0
        gy = uy if glyph_scale == 1.0 else (uy - 16.0) / glyph_scale + 16.0
        for x in range(W):
            ux = (x + 0.5) / W * 32.0
            gx = ux if glyph_scale == 1.0 else (ux - 16.0) / glyph_scale + 16.0
            g = glyph_cov(gx, gy, aa)
            o = (row + x) * 4
            buf[o] = int(BLUE[0] + (WHITE[0] - BLUE[0]) * g + .5)
            buf[o + 1] = int(BLUE[1] + (WHITE[1] - BLUE[1]) * g + .5)
            buf[o + 2] = int(BLUE[2] + (WHITE[2] - BLUE[2]) * g + .5)
            buf[o + 3] = 255
    return buf, W


def downsample(buf, W, target):
    f = W // target
    assert f * target == W, (W, target)
    out = bytearray(target * target * 4)
    for y in range(target):
        for x in range(target):
            tr = tg = tb = 0
            for dy in range(f):
                base = ((y * f + dy) * W + x * f) * 4
                for dx in range(f):
                    o = base + dx * 4
                    tr += buf[o]
                    tg += buf[o + 1]
                    tb += buf[o + 2]
            n = f * f
            o = (y * target + x) * 4
            out[o] = tr // n
            out[o + 1] = tg // n
            out[o + 2] = tb // n
            out[o + 3] = 255
    return out


def write_png(path, px, W):
    raw = bytearray()
    stride = W * 4
    for y in range(W):
        raw.append(0)
        raw += px[y * stride:(y + 1) * stride]
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, W, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", comp)
    png += chunk(b"IEND", b"")
    open(path, "wb").write(png)
    print("  %-26s %d x %d  (%d bytes)" % (os.path.basename(path), W, W, len(png)))


def build(name, size, ss, glyph_scale=1.0):
    buf, W = render(size, ss, glyph_scale)
    px = buf if W == size else downsample(buf, W, size)
    write_png(os.path.join(OUT, name), px, size)


if __name__ == "__main__":
    print("生成图标 -> %s" % OUT)
    build("icon-180.png", 180, 4)                 # iPad 主屏幕图标（iOS 自行裁圆角）
    build("icon-192.png", 192, 4)                 # Android / manifest
    build("icon-512.png", 512, 3)                 # manifest 大图 / 启动画面
    build("icon-maskable-512.png", 512, 3, 0.60)  # Android 自适应图标（安全区 60%）
    print("完成。")
