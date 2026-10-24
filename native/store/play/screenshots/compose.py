#!/usr/bin/env python3
"""Compose Google Play phone slides (1080x1920): real Android captures in a neutral phone frame.

Same look as the App Store set (native/store/screenshots): generated background, Outfit headline,
one idea per slide. The frame is plain CSS (no iPhone bezel on Android).
Usage: compose.py slides.json -> html/phone-NN.html; render.sh renders them.
"""
import json, pathlib, sys

W = pathlib.Path(__file__).resolve().parent
IOS = W.parents[1] / "screenshots" / "assets"  # shared background art and font
ICON = W.parents[2] / "assets" / "icon.png"
CW, CH = 1080, 1920
ACCENTS = {"teal": "#5CC4B0", "violet": "#B48CDB", "gold": "#E8C840"}

CSS = """
@font-face{font-family:'Outfit';src:url('%(font)s') format('truetype');font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box}
body{width:%(w)dpx;height:%(h)dpx;overflow:hidden;position:relative;font-family:'Outfit',sans-serif;color:#F4F1FA;
background:#0d0b1a url('%(bg)s') center/cover no-repeat}
.scrim{position:absolute;left:0;right:0;top:0;height:%(scrim)dpx;background:linear-gradient(rgba(13,11,26,.78) 55%%,rgba(13,11,26,0))}
.copy{position:absolute;left:0;right:0;top:0;height:470px;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 70px}
h1{font-size:112px;line-height:1.04;font-weight:800;letter-spacing:-.035em;text-shadow:0 4px 30px rgba(0,0,0,.5)}
h1 em{font-style:normal;color:%(accent)s;white-space:nowrap}
.dev{position:absolute;background:#16151b;box-shadow:inset 0 0 0 3px #3a3842,0 40px 80px rgba(0,0,0,.6)}
.dev .scr{position:absolute;overflow:hidden;background:#111}
.dev .scr img{display:block;width:100%%;height:100%%}
.cam{position:absolute;border-radius:50%%;background:#050507;box-shadow:0 0 0 2px #1d1c22}
.chips{position:absolute;left:0;right:0;display:flex;flex-wrap:wrap;justify-content:center;gap:22px;padding:0 60px}
.chips div{font-size:40px;font-weight:600;padding:20px 36px;border-radius:999px;background:rgba(13,11,26,.8);border:2px solid rgba(255,255,255,.16)}
"""


def phone(shot, x, y, h, landscape=False):
    """Neutral Android phone: thin bezel, rounded corners, punch-hole camera. Screen ratio 9:20."""
    b = round(h * 0.018)
    if landscape:
        w = h * 20 / 9
        sw, sh = w - 2 * b, h - 2 * b
        cam = f'<div class="cam" style="left:{b + sh * 0.035}px;top:{h / 2 - sh * 0.022}px;width:{sh * 0.044}px;height:{sh * 0.044}px"></div>'
    else:
        w = h * 9 / 20
        sw, sh = w - 2 * b, h - 2 * b
        cam = f'<div class="cam" style="left:{w / 2 - sw * 0.022}px;top:{b + sw * 0.035}px;width:{sw * 0.044}px;height:{sw * 0.044}px"></div>'
    r = sw * 0.09 if not landscape else sh * 0.09
    return (f'<div class="dev" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;border-radius:{r + b}px">'
            f'<div class="scr" style="left:{b}px;top:{b}px;width:{sw}px;height:{sh}px;border-radius:{r}px">'
            f'<img src="{shot}"></div>{cam}</div>'), w


def slide(s):
    accent = ACCENTS[s.get("accent", "teal")]
    css = CSS % dict(w=CW, h=CH, bg=IOS / "bg-portrait.jpg", font=IOS / "fonts" / "Outfit[wght].ttf",
                     accent=accent, scrim=CH // 4)
    if s.get("icon"):
        dev = (f'<img src="{ICON}" style="position:absolute;left:{(CW - 480) / 2}px;top:{CH * 0.33}px;width:480px;'
               f'height:480px;border-radius:108px;box-shadow:0 0 140px rgba(92,196,176,.35),0 40px 90px rgba(0,0,0,.6)">')
    elif s.get("landscape"):
        h = 460
        html, w = phone(str(W / "raw" / s["shot"]), 0, 0, h, landscape=True)
        dev = html.replace("left:0px;top:0px", f"left:{(CW - w) / 2}px;top:640px")
    else:
        h = 1380
        html, w = phone(str(W / "raw" / s["shot"]), 0, 0, h)
        dev = html.replace("left:0px;top:0px", f"left:{(CW - w) / 2}px;top:490px")
    chips = ""
    if s.get("chips"):
        chips = (f'<div class="chips" style="top:{s.get("chipsTop", 1250)}px">'
                 + "".join(f"<div>{c}</div>" for c in s["chips"]) + "</div>")
    return (f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head><body>'
            f'<div class="scrim"></div><div class="copy"><h1>{s["headline"]}</h1></div>{dev}{chips}</body></html>')


if __name__ == "__main__":
    spec = json.loads(pathlib.Path(sys.argv[1]).read_text())
    out = W / "html"
    out.mkdir(exist_ok=True)
    for i, s in enumerate(spec["phone"], 1):
        p = out / f"phone-{i:02d}.html"
        p.write_text(slide(s))
        print(p)
