from PIL import Image, ImageDraw
import math

OUT = "/workspace/assets"
BG = (7, 10, 28, 255)          # #070A1C deep indigo
BG_SPLASH = (4, 6, 21, 255)    # #040615

# crystal facet colors (RGBA)
WHITE = (255, 255, 255, 255)
ICE = (233, 246, 255, 255)
ICE2 = (200, 228, 255, 255)
BLUE = (159, 199, 245, 255)
BLUE2 = (127, 180, 236, 255)
DEEP = (106, 160, 223, 255)
RAINBOW = (110, 220, 255, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(4))


def diamond_points(cx, cy, S):
    # geometry matching the app
    tableY = cy - S * 0.40
    girdleY = cy - S * 0.05
    culetY = cy + S * 0.48
    tableHalf = S * 0.22
    girdleHalf = S * 0.50
    tL = (cx - tableHalf, tableY)
    tR = (cx + tableHalf, tableY)
    tm = (cx, tableY)
    gL = (cx - girdleHalf, girdleY)
    gR = (cx + girdleHalf, girdleY)
    gML = (cx - girdleHalf * 0.5, girdleY)
    gMR = (cx + girdleHalf * 0.5, girdleY)
    gc = (cx, girdleY)
    culet = (cx, culetY)
    return dict(tL=tL, tR=tR, tm=tm, gL=gL, gR=gR, gML=gML, gMR=gMR, gc=gc, culet=culet,
                tableHalf=tableHalf, girdleHalf=girdleHalf, tableY=tableY, girdleY=girdleY, culetY=culetY)


def draw_diamond(img, cx, cy, S):
    d = ImageDraw.Draw(img, "RGBA")
    p = diamond_points(cx, cy, S)
    tL, tR, tm = p["tL"], p["tR"], p["tm"]
    gL, gR, gML, gMR, gc, culet = p["gL"], p["gR"], p["gML"], p["gMR"], p["gc"], p["culet"]

    # crown left / right facets
    d.polygon([tL, tm, gML, gL], fill=lerp(ICE, BLUE, 0.35))
    d.polygon([tm, tR, gR, gML], fill=lerp(BLUE, BLUE2, 0.4))
    d.polygon([gL, gML, gc], fill=lerp(ICE2, BLUE, 0.3))
    d.polygon([gML, gR, gc], fill=lerp(ICE, BLUE, 0.15))
    # table
    d.polygon([tL, tm, tR], fill=WHITE)
    # subtle rainbow on table
    d.polygon([tL, tm, tR], fill=(0, 240, 255, 40))
    # pavilion
    d.polygon([gL, gML, culet], fill=lerp(WHITE, BLUE, 0.30))
    d.polygon([gML, gc, culet], fill=lerp(ICE, ICE2, 0.5))
    d.polygon([gc, gMR, culet], fill=lerp(BLUE, DEEP, 0.5))
    d.polygon([gMR, gR, culet], fill=lerp(ICE2, BLUE, 0.35))
    d.polygon([gc, gMR, culet], fill=(255, 61, 214, 30))
    # edges
    d.line([tL, tR, gR, gL, tL], fill=(255, 255, 255, 220), width=max(2, int(S * 0.02)), joint="curve")
    d.line([gL, gR, culet, gL], fill=(255, 255, 255, 120), width=max(1, int(S * 0.012)))
    d.line([tL, tm, tR], fill=(255, 255, 255, 160), width=max(1, int(S * 0.012)))


def radial_glow(img, cx, cy, radius, color):
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    steps = 40
    for i in range(steps, 0, -1):
        r = radius * i / steps
        a = int(color[3] * (1 - i / steps) ** 1.6)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(color[0], color[1], color[2], a))
    img.alpha_composite(overlay)


def make_icon(size):
    img = Image.new("RGBA", (size, size), BG)
    radial_glow(img, size * 0.5, size * 0.28, size * 0.6, (122, 114, 255, 60))
    radial_glow(img, size * 0.5, size * 0.72, size * 0.55, (46, 233, 255, 45))
    draw_diamond(img, size / 2, size / 2, size * 0.36)
    return img


def make_adaptive(size):
    # foreground only; transparent background (Android adds bg color)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    radial_glow(img, size * 0.5, size * 0.5, size * 0.5, (46, 233, 255, 60))
    draw_diamond(img, size / 2, size / 2, size * 0.30)
    return img


def make_splash(size):
    img = Image.new("RGBA", (size, size), BG_SPLASH)
    radial_glow(img, size * 0.5, size * 0.45, size * 0.6, (122, 114, 255, 70))
    draw_diamond(img, size / 2, size / 2, size * 0.34)
    return img


make_icon(1024).save(f"{OUT}/icon.png")
make_adaptive(1024).save(f"{OUT}/adaptive-icon.png")
make_splash(1024).save(f"{OUT}/splash-icon.png")
make_icon(196).save(f"{OUT}/favicon.png")
print("icons written")
