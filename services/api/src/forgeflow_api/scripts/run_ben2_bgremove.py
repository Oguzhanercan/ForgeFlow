#!/usr/bin/env python3
"""Background removal using BEN2 (PramaLLC/BEN2).

Usage:
    python run_ben2_bgremove.py --input-path <path> --output-path <path>

Outputs a PNG with transparent background (alpha channel).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="BEN2 background removal")
    parser.add_argument("--input-path", required=True, help="Input image path")
    parser.add_argument("--output-path", required=True, help="Output PNG path (with alpha)")
    parser.add_argument("--refine-foreground", action="store_true", default=False,
                        help="Run extra refinement step (slower, better edges)")
    args = parser.parse_args()

    input_path = Path(args.input_path)
    output_path = Path(args.output_path)

    if not input_path.exists():
        print(json.dumps({"error": f"Input not found: {input_path}"}), file=sys.stderr)
        sys.exit(1)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    from PIL import Image

    image = Image.open(str(input_path)).convert("RGB")

    bg_model = "none"
    device = "cpu"
    result_image = image

    try:
        import torch
        from ben2 import BEN_Base  # type: ignore[import]
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = BEN_Base.from_pretrained("PramaLLC/BEN2")
        model.to(torch.device(device)).eval()
        foreground = model.inference(image, refine_foreground=args.refine_foreground)
        result_image = foreground
        bg_model = "PramaLLC/BEN2"
    except ImportError:
        try:
            from rembg import remove as rembg_remove
            removed = rembg_remove(image)
            if isinstance(removed, Image.Image):
                result_image = removed
            else:
                from io import BytesIO
                result_image = Image.open(BytesIO(removed))
            bg_model = "rembg"
        except ImportError:
            image_rgba = image.convert("RGBA")
            pixels = image_rgba.load()
            if pixels:
                bg_color = pixels[0, 0]
                for y in range(image_rgba.height):
                    for x in range(image_rgba.width):
                        if pixels[x, y] == bg_color:
                            pixels[x, y] = (0, 0, 0, 0)
            result_image = image_rgba
            bg_model = "simple_pixel"

    result_image = result_image.convert("RGBA")
    result_image.save(str(output_path), format="PNG")

    result = {
        "path": str(output_path),
        "status": "completed",
        "device": device,
        "model": bg_model,
        "input": str(input_path),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
