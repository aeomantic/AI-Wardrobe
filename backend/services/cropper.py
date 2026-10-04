"""Crop detected normalized garment boxes from the processed source image."""

from __future__ import annotations

import io
import math

from PIL import Image

from backend.schemas import GarmentBox
from backend.services.media import image_to_data_url


def crop_garments(image: Image.Image, garments: list[GarmentBox]) -> list[GarmentBox]:
    """Return new garment models containing browser-ready JPEG crop data URLs."""

    return [
        garment.model_copy(update={"crop_base64": crop_garment(image, garment.box_2d)})
        for garment in garments
    ]


def crop_garment(image: Image.Image, box_2d: list[int]) -> str:
    """Map a normalized [ymin, xmin, ymax, xmax] box to image pixels."""

    width, height = image.size
    if width <= 0 or height <= 0:
        raise ValueError("Cannot crop an empty image.")
    ymin, xmin, ymax, xmax = box_2d
    left = max(0, min(width - 1, math.floor(xmin * width / 1000)))
    top = max(0, min(height - 1, math.floor(ymin * height / 1000)))
    right = max(left + 1, min(width, math.ceil(xmax * width / 1000)))
    bottom = max(top + 1, min(height, math.ceil(ymax * height / 1000)))

    crop = image.crop((left, top, right, bottom)).convert("RGB")
    output = io.BytesIO()
    crop.save(
        output,
        format="JPEG",
        quality=90,
        optimize=True,
        progressive=True,
        exif=b"",
    )
    return image_to_data_url(output.getvalue())
