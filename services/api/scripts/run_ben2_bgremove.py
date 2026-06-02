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

    try:
        import torch
        from PIL import Image
        from ben2 import BEN_Base  # type: ignore[import]
    except ImportError as e:
        print(json.dumps({"error": f"Missing dependency: {e}. Run: pip install -e 'git+https://github.com/PramaLLC/BEN2.git#egg=ben2'"}), file=sys.stderr)
        sys.exit(2)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = BEN_Base.from_pretrained("PramaLLC/BEN2")
    model.to(device).eval()

    image = Image.open(str(input_path)).convert("RGB")
    foreground = model.inference(image, refine_foreground=args.refine_foreground)

    # Save with transparency
    foreground.save(str(output_path), format="PNG")

    result = {
        "path": str(output_path),
        "status": "completed",
        "device": str(device),
        "input": str(input_path),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()
