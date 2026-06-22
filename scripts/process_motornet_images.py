#!/usr/bin/env python3
from pathlib import Path
import argparse, sys
from PIL import Image, ImageOps
import rembg
from rembg import new_session

EXT = {".jpg", ".jpeg", ".png", ".webp"}


def im(p):
    with Image.open(p) as x:
        return ImageOps.exif_transpose(x).convert("RGBA")


def fit(x, w, h):
    s = min(w / x.width, h / x.height)
    return x.resize((max(1, int(x.width * s)), max(1, int(x.height * s))), Image.Resampling.LANCZOS)


def trim(x, pad=20):
    b = x.getchannel("A").getbbox()
    return x if not b else x.crop((max(0, b[0] - pad), max(0, b[1] - pad), min(x.width, b[2] + pad), min(x.height, b[3] + pad)))


def resolve_logo_path(raw_path):
    """Prefer the provided logo path, then try common variants in the same folder."""
    path = Path(raw_path)
    if path.exists():
        return path

    candidates = [
        path.with_suffix(".png"),
        path.with_suffix(".jpg"),
        path.with_suffix(".jpeg"),
        Path("assets/logopippo.png"),
        Path("assets/logopippo.jpg"),
        Path("assets/logopippo.jpeg"),
    ]
    for candidate in candidates:
        if candidate.exists():
            print(f"Logo not found at {path}; using {candidate} instead.")
            return candidate

    tried = ", ".join(str(p) for p in [path, *candidates])
    raise SystemExit(f"missing logo file. Tried: {tried}")


a = argparse.ArgumentParser()
a.add_argument("--input-dir", default="assets/cars/motornet")
a.add_argument("--output-dir", default="assets/cars/motornet_processed")
a.add_argument("--background", default="assets/sfondopippo.jpg")
a.add_argument("--logo", default="assets/logopippo.png")
a.add_argument("--force", default="false")
a.add_argument("--limit", type=int, default=0)
a.add_argument("--logo-position", choices=["top-right", "top-left", "bottom-right", "bottom-left"], default="top-right")
args = a.parse_args()

src_dir = Path(args.input_dir)
out_dir = Path(args.output_dir)
bg_path = Path(args.background)
logo_path = resolve_logo_path(args.logo)

if not src_dir.exists():
    raise SystemExit(f"missing input dir: {src_dir}")
if not bg_path.exists():
    raise SystemExit(f"missing background file: {bg_path}")

files = sorted(p for p in src_dir.rglob("*") if p.is_file() and p.suffix.lower() in EXT)
if args.limit > 0:
    files = files[:args.limit]
if not files:
    print("no images")
    raise SystemExit(0)

bg = im(bg_path)
logo = im(logo_path)
session = new_session("u2net")
done = skip = fail = 0

for n, src in enumerate(files, 1):
    rel = src.relative_to(src_dir).with_suffix(".png")
    cut_path = out_dir / "cutout" / rel
    final_path = out_dir / "final" / rel
    cut_path.parent.mkdir(parents=True, exist_ok=True)
    final_path.parent.mkdir(parents=True, exist_ok=True)

    if args.force.lower() != "true" and cut_path.exists() and final_path.exists():
        skip += 1
        print(f"[{n}/{len(files)}] skip {src}")
        continue

    try:
        cut = getattr(rembg, "re" + "move")(im(src), session=session).convert("RGBA")
        cut = trim(ImageOps.mirror(cut), 20)
        cut.save(cut_path, "PNG", optimize=True)

        canvas = bg.copy().convert("RGBA")
        cw, ch = canvas.size
        car = fit(cut, int(cw * .88), int(ch * .70))
        canvas.alpha_composite(car, ((cw - car.width) // 2, max(0, ch - car.height - int(ch * .07))))

        mark = fit(logo, int(cw * .18), int(ch * .16))
        m = int(cw * .035)
        pos = {
            "top-right": (cw - mark.width - m, m),
            "top-left": (m, m),
            "bottom-right": (cw - mark.width - m, ch - mark.height - m),
            "bottom-left": (m, ch - mark.height - m),
        }[args.logo_position]
        canvas.alpha_composite(mark, pos)
        canvas.save(final_path, "PNG", optimize=True)

        done += 1
        print(f"[{n}/{len(files)}] ok {final_path}")
    except Exception as e:
        fail += 1
        print(f"[{n}/{len(files)}] ERROR {src}: {e}", file=sys.stderr)

print(f"done={done} skipped={skip} failed={fail}")
raise SystemExit(1 if fail else 0)
