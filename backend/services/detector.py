"""Provider-based garment detection with OpenAI and deterministic mock modes."""

from __future__ import annotations

import colorsys
from dataclasses import dataclass
import hashlib
import json
import logging
import os
import re
from typing import Any, Protocol

from PIL import Image, ImageStat

from backend.schemas import GarmentBox
from backend.services.media import image_to_data_url


LOGGER = logging.getLogger(__name__)
ALLOWED_CATEGORIES = {
    "outerwear",
    "top",
    "bottom",
    "footwear",
    "accessory",
    "one-piece",
}


class DetectorError(RuntimeError):
    """Raised when no garment detector can return a usable result."""


@dataclass(slots=True)
class DetectionResult:
    overall_vibe: str
    detected_garments: list[GarmentBox]
    style_breakdown: dict[str, str]
    provider: str


class VisionProvider(Protocol):
    name: str

    def detect(self, image: Image.Image, jpeg_bytes: bytes) -> DetectionResult:
        ...


OPENAI_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["overall_vibe", "detected_garments", "style_breakdown"],
    "properties": {
        "overall_vibe": {"type": "string"},
        "detected_garments": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "id",
                    "category",
                    "label",
                    "confidence",
                    "box_2d",
                    "color",
                    "material_estimate",
                    "silhouette",
                ],
                "properties": {
                    "id": {"type": "string"},
                    "category": {
                        "type": "string",
                        "enum": sorted(ALLOWED_CATEGORIES),
                    },
                    "label": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "box_2d": {
                        "type": "array",
                        "items": {"type": "integer", "minimum": 0, "maximum": 1000},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "color": {"type": "string"},
                    "material_estimate": {"type": "string"},
                    "silhouette": {"type": "string"},
                },
            },
        },
        "style_breakdown": {
            "type": "object",
            "additionalProperties": False,
            "required": ["color_palette", "fit", "layering", "mood"],
            "properties": {
                "color_palette": {"type": "string"},
                "fit": {"type": "string"},
                "layering": {"type": "string"},
                "mood": {"type": "string"},
            },
        },
    },
}


VISION_PROMPT = """Analyze only the visible outfit in this image.
Detect every distinct garment and wearable accessory that is actually visible, including
outerwear, tops, bottoms, one-piece garments, footwear, bags, belts, hats, scarves,
jewelry, and eyewear. Do not describe the person, body, or background.

For every item, return a tight box as [ymin, xmin, ymax, xmax]. Coordinates MUST be
integers normalized to a 0-1000 grid, where y is measured from the image top and x from
the image left. Never return pixel coordinates. Use one item per distinct garment, but
one shared footwear box is acceptable for a matching pair. Infer material conservatively.
Confidence represents visual certainty. Labels should be specific fashion names, such as
\"oversized denim trucker jacket\", rather than generic names such as \"clothes\".

Summarize the outfit's overall vibe and provide the required style breakdown. Return only
the JSON object required by the response schema.
"""


class OpenAIVisionProvider:
    """Multimodal detector backed by OpenAI structured outputs."""

    def __init__(self, *, api_key: str, model: str | None = None) -> None:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise DetectorError(
                "The openai package is required when OPENAI_API_KEY is configured."
            ) from exc

        self.model = model or os.getenv("OPENAI_VISION_MODEL", "gpt-4o-mini")
        timeout = _positive_env_float("AI_WARDROBE_OPENAI_TIMEOUT_SECONDS", 60.0)
        client_options: dict[str, Any] = {
            "api_key": api_key,
            "timeout": timeout,
            "max_retries": 1,
        }
        if os.getenv("OPENAI_BASE_URL"):
            client_options["base_url"] = os.environ["OPENAI_BASE_URL"]
        self.client = OpenAI(**client_options)
        self.name = f"openai:{self.model}"

    def detect(self, image: Image.Image, jpeg_bytes: bytes) -> DetectionResult:
        try:
            completion = self.client.chat.completions.create(
                model=self.model,
                temperature=0,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a precise fashion image decomposition engine. "
                            "Never infer garments that are not visible."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": VISION_PROMPT},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_to_data_url(jpeg_bytes),
                                    "detail": "high",
                                },
                            },
                        ],
                    },
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "outfit_decomposition",
                        "strict": True,
                        "schema": OPENAI_RESPONSE_SCHEMA,
                    },
                },
            )
        except Exception as exc:
            raise DetectorError("OpenAI vision request failed.") from exc

        try:
            message = completion.choices[0].message
            refusal = getattr(message, "refusal", None)
            if refusal:
                raise DetectorError(f"OpenAI declined the image analysis: {refusal}")
            if not message.content:
                raise DetectorError("OpenAI returned an empty analysis.")
            payload = json.loads(message.content)
            return _parse_detection_payload(
                payload,
                image_size=image.size,
                provider=self.name,
            )
        except DetectorError:
            raise
        except (AttributeError, IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            raise DetectorError("OpenAI returned an invalid outfit analysis.") from exc


class MockVisionProvider:
    """Image-aware deterministic detector for local development and CI."""

    name = "mock"

    _TEMPLATES: tuple[dict[str, Any], ...] = (
        {
            "category": "outerwear",
            "box_2d": [100, 205, 590, 795],
            "label": "Relaxed Utility Overshirt",
            "confidence": 0.91,
            "material_estimate": "midweight cotton twill",
            "silhouette": "relaxed, hip-length layer",
        },
        {
            "category": "top",
            "box_2d": [165, 325, 510, 675],
            "label": "Minimal Crew-Neck Top",
            "confidence": 0.94,
            "material_estimate": "soft cotton jersey",
            "silhouette": "clean, easy regular fit",
        },
        {
            "category": "bottom",
            "box_2d": [475, 295, 840, 705],
            "label": "Straight-Leg Trousers",
            "confidence": 0.93,
            "material_estimate": "structured woven blend",
            "silhouette": "high-rise straight leg",
        },
        {
            "category": "footwear",
            "box_2d": [815, 245, 985, 755],
            "label": "Low-Profile Sneakers",
            "confidence": 0.88,
            "material_estimate": "mixed leather and textile",
            "silhouette": "streamlined low top",
        },
        {
            "category": "accessory",
            "box_2d": [190, 400, 500, 690],
            "label": "Compact Shoulder Bag",
            "confidence": 0.86,
            "material_estimate": "smooth faux leather",
            "silhouette": "compact structured rectangle",
        },
    )

    def detect(self, image: Image.Image, jpeg_bytes: bytes) -> DetectionResult:
        fingerprint = hashlib.sha256(jpeg_bytes).hexdigest()[:8]
        garments: list[GarmentBox] = []
        colors: list[str] = []
        for index, template in enumerate(self._TEMPLATES, start=1):
            box = list(template["box_2d"])
            color = _region_color_name(image, box)
            colors.append(color)
            garments.append(
                GarmentBox(
                    id=f"{template['category']}-{fingerprint}-{index}",
                    category=template["category"],
                    label=f"{color} {template['label']}",
                    confidence=template["confidence"],
                    box_2d=box,
                    color=color,
                    material_estimate=template["material_estimate"],
                    silhouette=template["silhouette"],
                )
            )

        saturation, brightness = _image_character(image)
        if brightness < 0.34:
            vibe = "Monochrome Urban Layers"
            mood = "moody, architectural, and city-ready"
        elif saturation < 0.20:
            vibe = "Minimalist Scandinavian Casual"
            mood = "quiet, polished, and understated"
        elif brightness > 0.72:
            vibe = "Light Contemporary Casual"
            mood = "fresh, relaxed, and approachable"
        else:
            vibe = "Relaxed Modern Streetwear"
            mood = "easygoing, practical, and current"

        palette = ", ".join(dict.fromkeys(colors[:4]))
        return DetectionResult(
            overall_vibe=vibe,
            detected_garments=garments,
            style_breakdown={
                "color_palette": palette,
                "fit": "balanced relaxed proportions with a clean straight base",
                "layering": "light outer layer over a simple foundation",
                "mood": mood,
                "analysis_mode": "deterministic local mock estimate",
            },
            provider=self.name,
        )


class DetectorService:
    """Select a provider and safely apply configured fallback behavior."""

    def __init__(
        self,
        *,
        primary: VisionProvider | None,
        fallback: VisionProvider | None = None,
        strict: bool = False,
    ) -> None:
        self.primary = primary
        self.fallback = fallback or MockVisionProvider()
        self.strict = strict

    @classmethod
    def from_environment(cls) -> "DetectorService":
        strict = _env_flag("AI_WARDROBE_STRICT_PROVIDER", default=False)
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return cls(primary=None, fallback=MockVisionProvider(), strict=strict)
        return cls(
            primary=OpenAIVisionProvider(api_key=api_key),
            fallback=MockVisionProvider(),
            strict=strict,
        )

    @property
    def provider_name(self) -> str:
        if self.primary is not None:
            return self.primary.name
        return "unavailable" if self.strict else self.fallback.name

    def detect(self, image: Image.Image, jpeg_bytes: bytes) -> DetectionResult:
        if self.primary is None:
            if self.strict:
                raise DetectorError(
                    "OPENAI_API_KEY is required while AI_WARDROBE_STRICT_PROVIDER is enabled."
                )
            return self.fallback.detect(image, jpeg_bytes)

        try:
            return self.primary.detect(image, jpeg_bytes)
        except Exception as exc:
            if self.strict:
                if isinstance(exc, DetectorError):
                    raise
                raise DetectorError("The configured vision provider failed.") from exc
            LOGGER.warning(
                "Vision provider %s failed, using deterministic mock: %s",
                self.primary.name,
                type(exc).__name__,
            )
            return self.fallback.detect(image, jpeg_bytes)


def _parse_detection_payload(
    payload: dict[str, Any],
    *,
    image_size: tuple[int, int],
    provider: str,
) -> DetectionResult:
    if not isinstance(payload, dict):
        raise DetectorError("Detector output must be a JSON object.")
    raw_garments = payload.get("detected_garments")
    if not isinstance(raw_garments, list):
        raise DetectorError("Detector output did not contain a garment list.")

    garments: list[GarmentBox] = []
    used_ids: set[str] = set()
    for index, raw in enumerate(raw_garments, start=1):
        if not isinstance(raw, dict):
            continue
        category = _normalize_category(raw.get("category"))
        if category is None:
            continue
        try:
            box = _normalize_box(raw.get("box_2d"), image_size=image_size)
            confidence = min(1.0, max(0.0, float(raw.get("confidence", 0.5))))
        except (TypeError, ValueError):
            continue

        raw_id = _clean_text(raw.get("id"), fallback=f"{category}-{index}")
        identifier = _slugify(raw_id) or f"{category}-{index}"
        if identifier in used_ids:
            identifier = f"{identifier}-{index}"
        used_ids.add(identifier)
        garments.append(
            GarmentBox(
                id=identifier,
                category=category,
                label=_clean_text(
                    raw.get("label"), fallback=category.title(), max_length=160
                ),
                confidence=confidence,
                box_2d=box,
                color=_clean_text(
                    raw.get("color"), fallback="Unknown", max_length=80
                ),
                material_estimate=_clean_text(
                    raw.get("material_estimate"),
                    fallback="Not visually certain",
                    max_length=120,
                ),
                silhouette=_clean_text(
                    raw.get("silhouette"),
                    fallback="Not visually certain",
                    max_length=120,
                ),
            )
        )

    if not garments:
        raise DetectorError("Detector output contained no valid garments.")

    raw_breakdown = payload.get("style_breakdown")
    breakdown: dict[str, str] = {}
    if isinstance(raw_breakdown, dict):
        for key, value in raw_breakdown.items():
            if isinstance(key, str) and isinstance(value, (str, int, float, bool)):
                breakdown[_slugify(key).replace("-", "_")] = str(value).strip()
    breakdown.setdefault("color_palette", "mixed palette")
    breakdown.setdefault("fit", "balanced proportions")
    breakdown.setdefault("layering", "based on visible pieces")
    breakdown.setdefault("mood", "contemporary")

    return DetectionResult(
        overall_vibe=_clean_text(
            payload.get("overall_vibe"), fallback="Contemporary Mixed Style"
        ),
        detected_garments=garments,
        style_breakdown=breakdown,
        provider=provider,
    )


def _normalize_box(raw_box: Any, *, image_size: tuple[int, int]) -> list[int]:
    if not isinstance(raw_box, (list, tuple)) or len(raw_box) != 4:
        raise ValueError("A box must have four coordinates.")
    values = [float(value) for value in raw_box]
    width, height = image_size
    if max(values) > 1000:
        if width <= 0 or height <= 0:
            raise ValueError("Invalid image dimensions.")
        values = [
            values[0] * 1000 / height,
            values[1] * 1000 / width,
            values[2] * 1000 / height,
            values[3] * 1000 / width,
        ]

    ymin, xmin, ymax, xmax = [round(value) for value in values]
    ymin, ymax = sorted((max(0, min(1000, ymin)), max(0, min(1000, ymax))))
    xmin, xmax = sorted((max(0, min(1000, xmin)), max(0, min(1000, xmax))))
    ymin, ymax = _ensure_extent(ymin, ymax)
    xmin, xmax = _ensure_extent(xmin, xmax)
    return [ymin, xmin, ymax, xmax]


def _ensure_extent(start: int, end: int, minimum: int = 2) -> tuple[int, int]:
    if end - start >= minimum:
        return start, end
    if start >= 1000 - minimum:
        return 1000 - minimum, 1000
    return start, min(1000, start + minimum)


def _normalize_category(value: Any) -> str | None:
    normalized = str(value or "").strip().lower()
    aliases = {
        "jacket": "outerwear",
        "coat": "outerwear",
        "shirt": "top",
        "pants": "bottom",
        "trousers": "bottom",
        "shoes": "footwear",
        "shoe": "footwear",
        "bag": "accessory",
        "dress": "one-piece",
        "jumpsuit": "one-piece",
    }
    normalized = aliases.get(normalized, normalized)
    return normalized if normalized in ALLOWED_CATEGORIES else None


def _clean_text(value: Any, *, fallback: str, max_length: int = 160) -> str:
    text = " ".join(str(value or "").strip().split())
    return text[:max_length] if text else fallback[:max_length]


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:100]


def _region_color_name(image: Image.Image, box: list[int]) -> str:
    width, height = image.size
    ymin, xmin, ymax, xmax = box
    pixel_box = (
        max(0, int(xmin * width / 1000)),
        max(0, int(ymin * height / 1000)),
        min(width, max(1, int(xmax * width / 1000))),
        min(height, max(1, int(ymax * height / 1000))),
    )
    region = image.crop(pixel_box).convert("RGB")
    region.thumbnail((64, 64), Image.Resampling.BILINEAR)
    red, green, blue = ImageStat.Stat(region).median[:3]
    return _rgb_color_name(int(red), int(green), int(blue))


def _rgb_color_name(red: int, green: int, blue: int) -> str:
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    degrees = hue * 360
    if value < 0.16:
        return "Black"
    if saturation < 0.12:
        if value > 0.88:
            return "White"
        if value < 0.38:
            return "Charcoal"
        return "Gray"
    if degrees < 15 or degrees >= 345:
        return "Burgundy" if value < 0.5 else "Red"
    if degrees < 45:
        return "Camel" if saturation < 0.55 else "Orange"
    if degrees < 70:
        return "Mustard" if value < 0.75 else "Yellow"
    if degrees < 165:
        return "Olive" if value < 0.55 else "Green"
    if degrees < 200:
        return "Teal"
    if degrees < 255:
        return "Navy" if value < 0.48 else "Blue"
    if degrees < 290:
        return "Purple"
    if degrees < 345:
        return "Pink"
    return "Neutral"


def _image_character(image: Image.Image) -> tuple[float, float]:
    sample = image.convert("RGB")
    sample.thumbnail((96, 96), Image.Resampling.BILINEAR)
    statistics = ImageStat.Stat(sample)
    red, green, blue = [channel / 255 for channel in statistics.mean[:3]]
    _, saturation, brightness = colorsys.rgb_to_hsv(red, green, blue)
    return saturation, brightness


def _env_flag(name: str, *, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _positive_env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if not value:
        return default
    try:
        parsed = float(value)
    except ValueError:
        return default
    return parsed if parsed > 0 else default
