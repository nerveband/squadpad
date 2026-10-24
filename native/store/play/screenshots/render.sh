#!/bin/bash
# Render Google Play graphics:
#   phone/NN.png (1080x1920 slides from slides.json) and feature-graphic.png (1024x500 from feature.html).
# Tablet screenshots are plain captures: tablet-7/ and tablet-10/ are copied from raw/ (16:9, no added text).
# Needs agent-browser and Python with Pillow. Intermediate files go to html/ and out/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf html out
python3 compose.py slides.json >/dev/null
mkdir -p out
B="agent-browser --session squadpad-play"
$B set viewport 1080 1920 >/dev/null
for f in html/phone-*.html; do
  $B open "file://$PWD/$f" >/dev/null
  sleep 1
  $B screenshot "$PWD/out/$(basename "$f" .html).png" >/dev/null
done
$B set viewport 1024 500 >/dev/null
$B open "file://$PWD/feature.html" >/dev/null
sleep 1
$B screenshot "$PWD/out/feature.png" >/dev/null
$B close >/dev/null 2>&1 || true
python3 - <<'EOF'
from PIL import Image
import glob, os
for old in glob.glob("phone/*.png"):
    os.remove(old)
for f in sorted(glob.glob("out/phone-*.png")):
    im = Image.open(f).convert("RGB")
    assert im.size == (1080, 1920), (f, im.size)
    im.save(f"phone/{f.split('-')[-1]}", optimize=True)
im = Image.open("out/feature.png").convert("RGB")
assert im.size == (1024, 500), im.size
im.save("feature-graphic.png", optimize=True)
for size, dest in (("tab7", "tablet-7"), ("tab10", "tablet-10")):
    for i, n in enumerate(["home", "home2", "controller", "hud"], 1):
        Image.open(f"raw/{size}-{n}.png").convert("RGB").save(f"{dest}/{i:02d}.png", optimize=True)
print("phone", len(glob.glob("phone/*.png")), "slides; feature graphic; tablets")
EOF
