from __future__ import annotations

from io import BytesIO

from PIL import Image


def alpha_coverage(image: Image.Image) -> float:
    if image.mode != "RGBA":
        return 0.0
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    visible = sum(histogram[1:])
    total = image.size[0] * image.size[1]
    if total == 0:
        return 0.0
    return round(visible / total, 4)


def ensure_transparent_rgba(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    coverage = alpha_coverage(rgba)
    if 0 < coverage < 0.98:
        return rgba
    try:
        from rembg import remove

        removed = remove(rgba)
        if isinstance(removed, Image.Image):
            return removed.convert("RGBA")
        return Image.open(BytesIO(removed)).convert("RGBA")
    except Exception:
        return rgba


def validate_rgba_png(
    image: Image.Image,
    *,
    min_alpha_coverage: float = 0.02,
    max_alpha_coverage: float = 0.98,
) -> tuple[bool, str]:
    if image.mode != "RGBA":
        return False, "mode_not_rgba"
    coverage = alpha_coverage(image)
    if coverage < min_alpha_coverage:
        return False, "alpha_too_small"
    if coverage > max_alpha_coverage:
        return False, "alpha_too_large"
    return True, "ok"
