#!/bin/bash
# Render slides.json to App Store screenshots:
#   iphone-69/NN.jpg (1320x2868, 6.9" iPhone) and ipad-13/NN.jpg (2064x2752, 13" iPad).
# Needs agent-browser and Python with Pillow. Intermediate files go to html/ and out/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf html out
python3 compose.py "${1:-slides.json}" >/dev/null
mkdir -p out
B="agent-browser --session squadpad-slides"
for kind in iphone ipad; do
  if [ "$kind" = iphone ]; then $B set viewport 1320 2868 >/dev/null; else $B set viewport 2064 2752 >/dev/null; fi
  for f in html/$kind-*.html; do
    [ -e "$f" ] || continue
    $B open "file://$PWD/$f" >/dev/null
    sleep 1
    $B screenshot "$PWD/out/$(basename "$f" .html).png" >/dev/null
  done
done
$B close >/dev/null 2>&1 || true
python3 - <<'EOF'
from PIL import Image
import glob, os
for kind, (w, h), dest in (("iphone", (1320, 2868), "iphone-69"), ("ipad", (2064, 2752), "ipad-13")):
    files = sorted(glob.glob(f"out/{kind}-*.png"))
    for old in glob.glob(f"{dest}/*.jpg"):
        os.remove(old)
    for f in files:
        im = Image.open(f).convert("RGB")
        assert im.size == (w, h), (f, im.size)
        # Flattened RGB JPEG, as App Store Connect expects; quality 92 keeps text crisp.
        im.save(f"{dest}/{f.split('-')[-1][:-4]}.jpg", quality=92, subsampling=0, optimize=True)
    print(dest, len(files), "slides")
EOF
