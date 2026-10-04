from __future__ import annotations

import base64
import io
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from backend.main import app
from backend.schemas import GarmentBox
from backend.services.cropper import crop_garment
from backend.services.detector import DetectorService, MockVisionProvider
from backend.services.media import (
    MediaProcessingError,
    UnsupportedMediaError,
    classify_upload,
    extract_sharpest_video_frame,
    normalize_image,
)
from backend.services.stylist import build_style_suggestions


def _jpeg_bytes(size: tuple[int, int] = (320, 640)) -> bytes:
    image = Image.new("RGB", size, (220, 210, 190))
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=90)
    return output.getvalue()


def _png_bytes(size: tuple[int, int] = (64, 64)) -> bytes:
    image = Image.new("RGBA", size, (30, 80, 140, 128))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _garment(**updates: object) -> GarmentBox:
    payload: dict[str, object] = {
        "id": "top-1",
        "category": "top",
        "label": "White Cotton Tee",
        "confidence": 0.92,
        "box_2d": [100, 200, 600, 800],
        "color": "White",
        "material_estimate": "cotton jersey",
        "silhouette": "relaxed fit",
    }
    payload.update(updates)
    return GarmentBox(**payload)


class BackendPipelineTests(unittest.TestCase):
    def test_upload_contract_uses_exact_extensions_and_25_mb_default(self) -> None:
        cases = {
            "look.jpg": "image/jpeg",
            "look.png": "image/png",
            "look.webp": "image/webp",
            "look.mp4": "video/mp4",
            "look.mov": "video/quicktime",
        }
        with patch.dict(
            os.environ,
            {
                "AI_WARDROBE_MAX_IMAGE_BYTES": "",
                "AI_WARDROBE_MAX_VIDEO_BYTES": "",
            },
        ):
            for filename, mime_type in cases.items():
                with self.subTest(filename=filename):
                    descriptor = classify_upload(filename, mime_type)
                    self.assertEqual(descriptor.max_bytes, 25 * 1024 * 1024)
        with self.assertRaises(UnsupportedMediaError):
            classify_upload("look.jpeg", "image/jpeg")

    def test_schema_rejects_non_normalized_or_empty_boxes(self) -> None:
        with self.assertRaises(ValidationError):
            _garment(box_2d=[0, 0, 1001, 800])
        with self.assertRaises(ValidationError):
            _garment(box_2d=[100, 200, 100, 800])

    def test_image_normalizer_composites_alpha_and_returns_jpeg(self) -> None:
        result = normalize_image(_png_bytes(), declared_extension=".png")
        self.assertEqual(result.image.mode, "RGB")
        self.assertEqual(result.image.size, (64, 64))
        self.assertTrue(result.jpeg_bytes.startswith(b"\xff\xd8"))
        with Image.open(io.BytesIO(result.jpeg_bytes)) as decoded:
            self.assertEqual(decoded.format, "JPEG")
            self.assertFalse(decoded.getexif())

    def test_mock_detector_is_deterministic_and_normalized(self) -> None:
        media = normalize_image(_jpeg_bytes(), declared_extension=".jpg")
        provider = MockVisionProvider()
        first = provider.detect(media.image, media.jpeg_bytes)
        second = provider.detect(media.image, media.jpeg_bytes)
        self.assertEqual(first.detected_garments, second.detected_garments)
        self.assertEqual(len(first.detected_garments), 5)
        self.assertEqual(
            {item.category for item in first.detected_garments},
            {"outerwear", "top", "bottom", "footwear", "accessory"},
        )
        for garment in first.detected_garments:
            ymin, xmin, ymax, xmax = garment.box_2d
            self.assertTrue(0 <= ymin < ymax <= 1000)
            self.assertTrue(0 <= xmin < xmax <= 1000)

    def test_cropper_uses_yx_normalized_coordinate_order(self) -> None:
        image = Image.new("RGB", (200, 100), "navy")
        crop_data_url = crop_garment(image, [250, 250, 750, 750])
        self.assertTrue(crop_data_url.startswith("data:image/jpeg;base64,"))
        encoded = crop_data_url.split(",", 1)[1]
        with Image.open(io.BytesIO(base64.b64decode(encoded))) as crop:
            self.assertEqual(crop.size, (100, 50))

    def test_stylist_returns_three_flat_string_recipes(self) -> None:
        recipes = build_style_suggestions(
            [_garment()], overall_vibe="Minimal Modern"
        )
        self.assertEqual(
            [recipe["title"] for recipe in recipes],
            ["Casual Day Out", "Elevated Evening", "Layered Alternative"],
        )
        self.assertTrue(
            all(
                isinstance(key, str) and isinstance(value, str)
                for recipe in recipes
                for key, value in recipe.items()
            )
        )

    def test_missing_ffmpeg_has_clear_media_error(self) -> None:
        with self.assertRaisesRegex(MediaProcessingError, "ffmpeg was not found"):
            extract_sharpest_video_frame(
                b"not-a-video",
                suffix=".mp4",
                ffmpeg_binary="missing-ffmpeg-binary",
            )

    def test_analyze_endpoint_uses_mock_and_returns_contract(self) -> None:
        detector = DetectorService(
            primary=None, fallback=MockVisionProvider(), strict=False
        )
        with patch("backend.main.get_detector_service", return_value=detector):
            with TestClient(app) as client:
                response = client.post(
                    "/api/analyze-outfit",
                    files={"file": ("outfit.jpg", _jpeg_bytes(), "image/jpeg")},
                )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(
            payload["processed_image_base64"].startswith(
                "data:image/jpeg;base64,"
            )
        )
        self.assertEqual(len(payload["detected_garments"]), 5)
        self.assertEqual(len(payload["build_suggestions"]), 3)
        self.assertTrue(
            all(
                garment["crop_base64"].startswith("data:image/jpeg;base64,")
                for garment in payload["detected_garments"]
            )
        )

    def test_endpoint_rejects_mismatched_image_contents(self) -> None:
        with TestClient(app) as client:
            response = client.post(
                "/api/analyze-outfit",
                files={"file": ("fake.jpg", _png_bytes(), "image/jpeg")},
            )
        self.assertEqual(response.status_code, 422)
        self.assertIn("not JPEG", response.json()["detail"])

    def test_endpoint_rejects_unsupported_extension(self) -> None:
        with TestClient(app) as client:
            response = client.post(
                "/api/analyze-outfit",
                files={"file": ("outfit.gif", b"GIF89a", "image/gif")},
            )
        self.assertEqual(response.status_code, 415)


if __name__ == "__main__":
    unittest.main()
