#!/usr/bin/env python3
"""Compose App Store slides: real captures inside device frames over a generated background.

Rules follow ParthJadhav/app-store-screenshots: headline <= 3 lines, phone ~72% of canvas
height, official iPhone bezel (mockup.png, screen inset 52/46/918/1990, radius 126).
Usage: compose.py <slides.json>  -> writes html/*.html; render.sh renders them with agent-browser.
"""
import json, sys, pathlib

W = pathlib.Path(__file__).resolve().parent
A = W / "assets"  # mockup.png (MIT, from the skill template) and the generated backgrounds
ICON = W.parents[1] / "assets" / "icon.png"
TEAL, VIOLET, GOLD, INK = "#5CC4B0", "#B48CDB", "#E8C840", "#F4F1FA"

BASE_CSS = """
@font-face{font-family:'Outfit';src:url('%(font)s') format('truetype');font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box}
body{width:%(w)dpx;height:%(h)dpx;overflow:hidden;background:#0d0b1a url('%(bg)s') center/cover no-repeat;
font-family:'Outfit',sans-serif;color:%(ink)s;position:relative}
.scrim{position:absolute;left:0;right:0;top:0;height:%(scrim)dpx;background:linear-gradient(rgba(13,11,26,.78) 55%%,rgba(13,11,26,0))}
.copy{position:absolute;left:0;right:0;top:0;height:%(band)dpx;display:flex;align-items:center;justify-content:center;
text-align:center;padding:0 %(pad)dpx}
h1{font-size:%(hs)dpx;line-height:1.04;font-weight:800;letter-spacing:-.035em;text-shadow:0 4px 30px rgba(0,0,0,.5)}
h1 em{font-style:normal;color:%(accent)s;white-space:nowrap}
.dev{position:absolute;filter:drop-shadow(0 40px 80px rgba(0,0,0,.6))}
.dev img.shot{position:absolute;object-fit:cover;object-position:top;display:block}
"""


def iphone(shot, x, y, w, rotate=False):
    """Official bezel. rotate=True shows a landscape capture in a landscape-held phone."""
    h = w * 2082 / 1022
    sl, st, sw, sh = 52 / 1022 * w, 46 / 2082 * h, 918 / 1022 * w, 1990 / 2082 * h
    r = 126 / 918 * sw
    if rotate:
        # Portrait phone rotated -90deg about its centre; the landscape capture is turned +90deg inside it.
        style = f"left:{x}px;top:{y}px;width:{w}px;height:{h}px;transform:rotate(-90deg)"
        shot_style = f"transform-origin:0 0;transform:translate({sw}px,0) rotate(90deg);width:{sh}px;height:{sw}px"
        inner = f'<img class="shot" src="{shot}" style="left:0;top:0;{shot_style}">'
    else:
        style = f"left:{x}px;top:{y}px;width:{w}px;height:{h}px"
        inner = f'<img class="shot" src="{shot}" style="left:0;top:0;width:{sw}px;height:{sh}px">'
    # mockup.png has an opaque centre, so the screen layer goes on top of it (as in the template).
    return (f'<div class="dev" style="{style}">'
            f'<img src="{A}/mockup.png" style="position:absolute;inset:0;width:100%;height:100%">'
            f'<div style="position:absolute;z-index:10;left:{sl}px;top:{st}px;width:{sw}px;height:{sh}px;'
            f'border-radius:{r}px;overflow:hidden;background:#111">{inner}</div></div>')


def ipad(shot, x, y, w, ratio):
    """CSS iPad Pro frame: thin uniform bezel. ratio = screen h/w."""
    b = w * 0.028
    sw = w - 2 * b
    sh = sw * ratio
    return (f'<div class="dev" style="left:{x}px;top:{y}px;width:{w}px;height:{sh + 2 * b}px;'
            f'background:#1b1a20;border-radius:{b * 2.6}px;box-shadow:inset 0 0 0 3px #3a3842">'
            f'<div style="position:absolute;left:{b}px;top:{b}px;width:{sw}px;height:{sh}px;'
            f'border-radius:{b * 1.5}px;overflow:hidden;background:#111">'
            f'<img class="shot" src="{shot}" style="left:0;top:0;width:100%;height:100%"></div></div>')


def slide(s, kind):
    if kind == "iphone":
        cw, ch, hs, band, pad, bg = 1320, 2868, 146, 740, 80, f"{A}/bg-portrait.jpg"
    else:
        cw, ch, hs, band, pad, bg = 2064, 2752, 156, 700, 200, f"{A}/bg-ipad.jpg"
    accent = {"teal": TEAL, "violet": VIOLET, "gold": GOLD}[s.get("accent", "teal")]
    css = BASE_CSS % dict(w=cw, h=ch, bg=bg, ink=INK, band=band, pad=pad, hs=hs, accent=accent,
                          scrim=ch // 4, font=A / "fonts" / "Outfit[wght].ttf")
    shot = str(W / "raw" / s["shot"]) if s.get("shot") else None
    screen = None  # (left, top, scale) of the device screen on the canvas, for callouts
    if s.get("icon"):
        dev = (f'<img src="{ICON}" style="position:absolute;left:{(cw - 620) / 2}px;top:{ch * 0.30}px;'
               f'width:620px;height:620px;border-radius:140px;box-shadow:0 0 160px rgba(92,196,176,.35),'
               f'0 40px 90px rgba(0,0,0,.6)">')
    elif kind == "iphone":
        if s.get("landscape"):
            L = 1440  # long side; bleeds ~60px past each canvas edge, screen content stays in view
            pw = L * 1022 / 2082
            dev = iphone(shot, (cw - pw) / 2, 1250 - L / 2, pw, rotate=True)
        else:
            pw = round(0.768 * cw)
            dev = iphone(shot, (cw - pw) / 2, 760, pw)
            screen = ((cw - pw) / 2 + 52 / 1022 * pw, 760 + 46 / 1022 * pw, 918 / 1022 * pw / 1320)
    else:
        pw = 1640
        dev = ipad(shot, (cw - pw) / 2, 720, pw, s.get("ratio", 2752 / 2064))
        b = pw * 0.028
        screen = ((cw - pw) / 2 + b, 720 + b, (pw - 2 * b) / s.get("shotW", 2064))
    callout = ""
    if s.get("callout") and screen:
        # Enlarged crop of the real capture, centred over the spot it came from.
        x0, y0, x1, y1 = s["callout"]
        cwid = s.get("calloutW", 1200 if kind == "iphone" else 1760)
        k = cwid / (x1 - x0)
        cy = screen[1] + (y0 + y1) / 2 * screen[2]
        sw_px = s.get("shotW", 1320 if kind == "iphone" else 2064)
        callout = (f'<div style="position:absolute;z-index:20;left:{(cw - cwid) / 2}px;top:{max(cy - (y1 - y0) * k / 2, s.get("calloutMinTop", 0))}px;'
                   f'width:{cwid}px;height:{(y1 - y0) * k}px;overflow:hidden;border-radius:48px;'
                   f'box-shadow:0 0 0 4px {accent}88,0 30px 90px rgba(0,0,0,.75),0 0 120px {accent}55">'
                   f'<img src="{shot}" style="position:absolute;left:{-x0 * k}px;top:{-y0 * k}px;width:{sw_px * k}px"></div>')
    chips = ""
    if s.get("chips"):
        chips = ('<div style="position:absolute;left:0;right:0;top:%dpx;display:flex;flex-wrap:wrap;'
                 'justify-content:center;gap:28px;padding:0 80px">' % s.get("chipsTop", 1830)
                 + "".join(f'<div style="font-size:50px;font-weight:600;padding:26px 46px;border-radius:999px;'
                           f'background:rgba(13,11,26,.8);border:2px solid rgba(255,255,255,.16)">{c}</div>'
                           for c in s["chips"])
                 + "</div>")
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>'
            f'<div class="scrim"></div><div class="copy"><h1>{s["headline"]}</h1></div>'
            f'{dev}{callout}{chips}</body></html>')


if __name__ == "__main__":
    spec = json.loads(pathlib.Path(sys.argv[1]).read_text())
    out = W / "html"
    out.mkdir(exist_ok=True)
    for kind in ("iphone", "ipad"):
        for i, s in enumerate(spec.get(kind, []), 1):
            p = out / f"{kind}-{i:02d}.html"
            p.write_text(slide(s, kind))
            print(p)
