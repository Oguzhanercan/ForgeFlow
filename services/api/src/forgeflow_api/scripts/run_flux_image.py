#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output-path", required=True)
    parser.add_argument("--source-image-path")
    parser.add_argument("--height", type=int, default=768)
    parser.add_argument("--width", type=int, default=768)
    parser.add_argument("--guidance-scale", type=float, default=1.0)
    parser.add_argument("--num-inference-steps", type=int, default=4)
    parser.add_argument("--seed", type=int, default=1000)
    args = parser.parse_args()

    import torch
    from diffusers import Flux2KleinPipeline, PipelineQuantizationConfig

    model_path = Path(args.model_path)
    local_files_only = model_path.exists()
    cuda_available = torch.cuda.is_available()
    gpu_total_gb = None
    if cuda_available:
        gpu_total_gb = round(torch.cuda.get_device_properties(0).total_memory / (1024**3))

    height = args.height
    width = args.width
    steps = args.num_inference_steps
    if height * width > 512 * 512:
        height = 512
        width = 512
    if steps > 4:
        steps = 4
    if gpu_total_gb is not None and gpu_total_gb < 16:
        height = min(height, 384)
        width = min(width, 384)
        steps = min(steps, 3)

    device = "cuda" if cuda_available else "cpu"
    dtype = torch.bfloat16 if cuda_available else torch.float32
    quantization_config = None
    if cuda_available:
        quantization_config = PipelineQuantizationConfig(
            quant_backend="bitsandbytes_4bit",
            quant_kwargs={
                "load_in_4bit": True,
                "bnb_4bit_quant_type": "nf4",
                "bnb_4bit_use_double_quant": True,
                "bnb_4bit_compute_dtype": "bfloat16",
            },
            components_to_quantize=["text_encoder", "transformer"],
        )

    pipe = Flux2KleinPipeline.from_pretrained(
        args.model_path,
        torch_dtype=dtype,
        local_files_only=local_files_only,
        quantization_config=quantization_config,
        low_cpu_mem_usage=True,
    )
    pipe.to(device)
    if cuda_available:
        pipe.enable_attention_slicing("auto")
    pipe.set_progress_bar_config(disable=True)

    generator = torch.Generator(device=device).manual_seed(args.seed)
    pipe_kwargs = {
        "prompt": args.prompt,
        "height": height,
        "width": width,
        "guidance_scale": args.guidance_scale,
        "num_inference_steps": steps,
        "generator": generator,
    }
    if args.source_image_path:
        from diffusers.utils import load_image

        pipe_kwargs["image"] = load_image(args.source_image_path)

    image = pipe(**pipe_kwargs).images[0]
    output_path = Path(args.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)
    if cuda_available:
        torch.cuda.empty_cache()
    print(
        json.dumps(
            {
                "device": device,
                "height": height,
                "width": width,
                "num_inference_steps": steps,
                "path": str(output_path),
                "source_image_path": args.source_image_path,
            }
        )
    )


if __name__ == "__main__":
    main()
