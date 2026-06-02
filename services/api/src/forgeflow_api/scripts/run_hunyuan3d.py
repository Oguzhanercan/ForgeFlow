#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import sys
import types
from pathlib import Path

from PIL import Image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root-dir", required=True)
    parser.add_argument("--image-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()

    import torch

    root_dir = Path(args.root_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    image_path = Path(args.image_path)
    initial_glb = output_dir / f"{args.name}_initial.glb"
    textured_obj = output_dir / f"{args.name}.obj"
    textured_glb = output_dir / f"{args.name}.glb"

    sys.path.insert(0, str(root_dir))
    sys.path.insert(0, str(root_dir / "hy3dshape"))
    sys.path.insert(0, str(root_dir / "hy3dpaint"))

    from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline
    from torchvision_fix import apply_fix

    shape_pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        "tencent/Hunyuan3D-2.1",
        subfolder="hunyuan3d-dit-v2-1",
    )
    image = Image.open(image_path).convert("RGBA")
    with torch.inference_mode():
        mesh = shape_pipe(image=image)[0]
        mesh.export(initial_glb)
    del shape_pipe
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    apply_fix()
    sys.modules.setdefault("bpy", types.ModuleType("bpy"))
    from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
    from hy3dpaint.convert_utils import create_glb_with_pbr_materials

    conf = Hunyuan3DPaintConfig(6, 512)
    conf.realesrgan_ckpt_path = str(root_dir / "hy3dpaint/ckpt/RealESRGAN_x4plus.pth")
    conf.multiview_cfg_path = str(root_dir / "hy3dpaint/cfgs/hunyuan-paint-pbr.yaml")
    conf.custom_pipeline = str(root_dir / "hy3dpaint/hunyuanpaintpbr")
    paint_pipe = Hunyuan3DPaintPipeline(conf)

    with torch.inference_mode():
        paint_pipe(
            mesh_path=str(initial_glb),
            image_path=image,
            output_mesh_path=str(textured_obj),
            save_glb=False,
        )
        textures = {
            "albedo": str(textured_obj.with_suffix(".jpg")),
            "metallic": str(textured_obj.with_name(f"{textured_obj.stem}_metallic.jpg")),
            "roughness": str(textured_obj.with_name(f"{textured_obj.stem}_roughness.jpg")),
        }
        create_glb_with_pbr_materials(str(textured_obj), textures, str(textured_glb))

    print(
        json.dumps(
            {
                "initial_glb": str(initial_glb),
                "asset_path": str(textured_glb),
            }
        )
    )


if __name__ == "__main__":
    main()
